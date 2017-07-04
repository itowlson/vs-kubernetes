import { Shell } from './shell';

export interface FindBinaryResult {
    err : number | null;
    output : string;
}

export async function findBinary(shell : Shell, binName : string) : Promise<FindBinaryResult> {
    let cmd = `which ${binName}`;

    if (shell.isWindows()) {
        cmd = `where.exe ${binName}.exe`;
    }

    const opts = {
        async: true,
        env: {
            HOME: process.env.HOME,
            PATH: process.env.PATH
        }
    }

    const execResult = await shell.execCore(cmd, opts);
    if (execResult.code) {
        return { err: execResult.code, output: execResult.stderr };
    }

    return { err: null, output: execResult.stdout };
}

export function execPath(shell : Shell, basePath : string) : string {
    let bin = basePath;
    if (shell.isWindows() && bin && !(bin.endsWith('.exe'))) {
        bin = bin + '.exe';
    }
    return bin;
}
