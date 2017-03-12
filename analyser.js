function analyse(dockerfile) {
    if (!dockerfile) {
        return { succeeded: false };
    }

    // Analysis is entirely heuristic - it looks for characteristic text in the
    // dockerfile, specifically EXPOSE and CMD elements

    var succeeded = false;
    var runtime = undefined;
    var exposesService = false;
    var seenEntryPoint = false;

    var lines = dockerfile.split(/\r?\n/);
    lines.forEach(function (line) {
        if (line.startsWith("ENTRYPOINT ")) {
            runtime = inferRuntime(line.substring(11));
            if (runtime) {
                succeeded = true;
            }
            seenEntryPoint = true;
        }
        if (line.startsWith("CMD ") && !seenEntryPoint) {
            runtime = inferRuntime(line.substring(4));
            if (runtime) {
                succeeded = true;
            }
        }
        if (line.startsWith("EXPOSE ")) {
            exposesService = true;
        }
    });

    return { succeeded: succeeded, runtime: runtime, exposesService: exposesService };
}

function inferRuntime(dockerCmd) {
    // Possible forms:
    // ["executable", "param1", "param2"] (exec form)
    // command param1 param2 (shell form)
    var items = undefined;
    if (dockerCmd.startsWith('[')) {
        // exec form
        items = JSON.parse(dockerCmd);
    } else {
        items = dockerCmd.split(/\s+/)
    }

    if (items.length < 1) {
        return null;
    }

    var command = items[0].trim();

    if (command === "node") {
        return 'node';
    }
    if (command === "python") {
        return 'python';
    }
    if (command.endsWith('.rb')) {
        return 'ruby';
    }

    return null;
}

exports.analyse = analyse;
