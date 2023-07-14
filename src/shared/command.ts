import { ChildProcessWithoutNullStreams } from 'child_process';

export async function handleProcessOutput(childProcess: ChildProcessWithoutNullStreams) {
	// stdout
	for await (const chunkBytes of childProcess.stdout) {
		console.info(String(chunkBytes));
	}
	childProcess?.stdout?.on('data', function (data: string): void {
		console.info(`command output: ${data}`);
	});

	// stderr
	let stderr = '';
	for await (const chunk of childProcess.stderr) {
		stderr += chunk;
	}
	if (stderr) {
		console.error(`Stderr Error: ${stderr}`);
	}

	// wait for childProcess to complete
	await new Promise((resolve, _reject): void => {
		childProcess.on('close', resolve);
	});
}
