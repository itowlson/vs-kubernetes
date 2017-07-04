import { Host } from './host';
import { Shell } from './shell';
import { FS } from './fs';
import * as path from 'path';

export interface Draft {
    checkPresent() : Promise<boolean>;
    isFolderMapped(dirPath: string) : boolean;
    packs() : Promise<string[] | undefined>;
}

export function create(host : Host, fs : FS, shell : Shell) : Draft {
    return new DraftImpl(host, fs, shell, false);
}

interface Context {
    readonly host : Host;
    readonly fs : FS;
    readonly shell : Shell;
    draftFound : boolean;
}

class DraftImpl implements Draft {
    constructor(host : Host, fs : FS, shell : Shell, draftFound : boolean) {
        this.context = { host : host, fs : fs, shell : shell, draftFound : draftFound };
    }

    private readonly context : Context;

    checkPresent() : Promise<boolean> {
        return checkPresent(this.context);
    }

    isFolderMapped(dirPath: string) : boolean {
        return isFolderMapped(this.context, dirPath);
    }

    packs() : Promise<string[] | undefined> {
        return packs(this.context);
    }
}

async function checkPresent(context : Context) : Promise<boolean> {
    if (context.draftFound) {
        return true;
    }

    return await checkForDraftInternal(context);
}

async function packs(context : Context) : Promise<string[] | undefined> {
    if (await checkPresent(context)) {
        const dhResult = await context.shell.exec("draft home");
        if (dhResult.code === 0) {
            const draftHome = dhResult.stdout.trim();
            const draftPacksDir = path.join(draftHome, 'packs');
            const draftPacks = context.fs.dirSync(draftPacksDir);
            return draftPacks;
        }
    }

    return undefined;
}

// TODO: reduce duplication with kubectl module

async function checkForDraftInternal(context : Context) : Promise<boolean> {
    const
        bin = context.host.getConfiguration('vs-kubernetes')['vs-kubernetes.draft-path'];

    if (!bin) {
        const fb = await findBinary(context, 'draft');

        if (fb.err || fb.output.length === 0) {
            alertNoDraft(context, 'inferFailed', 'Could not find "draft" binary.');
            return false;
        }

        context.draftFound = true;

        return true;
    }

    context.draftFound = context.fs.existsSync(bin);

    if (!context.draftFound) {
        alertNoDraft(context, 'configuredFileMissing', bin + ' does not exist!');
    }

    return context.draftFound;
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

// TODO: this is an exact duplicate of kubectl.findBinary

interface FindBinaryResult {
    err : number | null;
    output : string;
}

async function findBinary(context : Context, binName : string) : Promise<FindBinaryResult> {
    let cmd = `which ${binName}`;

    if (context.shell.isWindows()) {
        cmd = `where.exe ${binName}.exe`;
    }

    const opts = {
        async: true,
        env: {
            HOME: process.env.HOME,
            PATH: process.env.PATH
        }
    }

    const execResult = await context.shell.execCore(cmd, opts);
    if (execResult.code) {
        return { err: execResult.code, output: execResult.stderr };
    }

    return { err: null, output: execResult.stdout };
}

// END TODO

function isFolderMapped(context: Context, dirPath: string) : boolean {
    // Heuristic based on files created by 'draft create'
    const tomlFile = path.join(dirPath, '.draftignore');
    const ignoreFile = path.join(dirPath, 'draft.toml');
    return context.fs.existsSync(tomlFile) && context.fs.existsSync(ignoreFile);
}