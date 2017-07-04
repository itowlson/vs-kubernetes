import { Host } from './host';
import { Shell, ShellResult } from './shell';
import { FS } from './fs';
import * as syspath from 'path';
import * as binutil from './binutil';

export interface Draft {
    checkPresent() : Promise<boolean>;
    isFolderMapped(path: string) : boolean;
    packs() : Promise<string[] | undefined>;
    invoke(args: string) : Promise<ShellResult>;
    path() : Promise<string | undefined>;
}

export function create(host : Host, fs : FS, shell : Shell) : Draft {
    return new DraftImpl(host, fs, shell, false);
}

interface Context {
    readonly host : Host;
    readonly fs : FS;
    readonly shell : Shell;
    binFound : boolean;
    binPath : string;
}

class DraftImpl implements Draft {
    constructor(host : Host, fs : FS, shell : Shell, draftFound : boolean) {
        this.context = { host : host, fs : fs, shell : shell, binFound : draftFound, binPath : 'draft' };
    }

    private readonly context : Context;

    checkPresent() : Promise<boolean> {
        return checkPresent(this.context);
    }

    isFolderMapped(path: string) : boolean {
        return isFolderMapped(this.context, path);
    }

    packs() : Promise<string[] | undefined> {
        return packs(this.context);
    }

    invoke(args: string) : Promise<ShellResult> {
        return invoke(this.context, args);
    }

    path() : Promise<string | undefined> {
        return path(this.context);
    }
}

async function checkPresent(context : Context) : Promise<boolean> {
    if (context.binFound) {
        return true;
    }

    return await checkForDraftInternal(context);
}

async function packs(context : Context) : Promise<string[] | undefined> {
    if (await checkPresent(context)) {
        const dhResult = await context.shell.exec("draft home");
        if (dhResult.code === 0) {
            const draftHome = dhResult.stdout.trim();
            const draftPacksDir = syspath.join(draftHome, 'packs');
            const draftPacks = context.fs.dirSync(draftPacksDir);
            return draftPacks;
        }
    }

    return undefined;
}

async function invoke(context : Context, args : string) : Promise<ShellResult> {
    if (await checkPresent(context)) {
        const result = context.shell.exec(context.binPath + ' ' + args);
        return result;
    }
}

// TODO: Windows-isation is similar to kubectl module
async function path(context : Context) : Promise<string | undefined> {
    let bin = await pathCore(context);
    return binutil.execPath(context.shell, bin);
}

async function pathCore(context : Context) : Promise<string | undefined> {
    if (await checkPresent(context)) {
        return context.binPath;
    }
    return undefined;
}

// TODO: reduce duplication with kubectl module

async function checkForDraftInternal(context : Context) : Promise<boolean> {
    const
        bin = context.host.getConfiguration('vs-kubernetes')['vs-kubernetes.draft-path'];

    if (!bin) {
        const fb = await binutil.findBinary(context.shell, 'draft');

        if (fb.err || fb.output.length === 0) {
            alertNoDraft(context, 'inferFailed', 'Could not find "draft" binary.');
            return false;
        }

        context.binFound = true;

        return true;
    }

    context.binFound = context.fs.existsSync(bin);

    if (context.binFound) {
        context.binPath = bin;
    } else {
        alertNoDraft(context, 'configuredFileMissing', bin + ' does not exist!');
    }

    return context.binFound;
}

type CheckPresentFailureReason = 'inferFailed' | 'configuredFileMissing';

function alertNoDraft(context : Context, failureReason : CheckPresentFailureReason, message : string) : void {
    switch (failureReason) {
        case 'inferFailed':
            context.host.showErrorMessage(message, 'Learn more').then(
                (str) => {
                    if (str !== 'Learn more') {
                        return;
                    }

                    context.host.showInformationMessage('Add draft directory to path, or set "vs-kubernetes.draft-path" config to kubectl binary.');
                }
            );
            break;
        case 'configuredFileMissing':
            context.host.showErrorMessage(message);
            break;
    }
}

function isFolderMapped(context: Context, path: string) : boolean {
    // Heuristic based on files created by 'draft create'
    const tomlFile = syspath.join(path, '.draftignore');
    const ignoreFile = syspath.join(path, 'draft.toml');
    return context.fs.existsSync(tomlFile) && context.fs.existsSync(ignoreFile);
}