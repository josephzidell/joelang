import { execSync } from 'child_process';

const llvmVersion = 14;
const llvmVersionForChoco = '14.0.6';
export const llcCommand = isExecutableAvailable(`llc-${llvmVersion}`) ? `llc-${llvmVersion}` : 'llc';

/**
 * Checks if the system requirements are met.
 *
 * If not, it will try to install the missing dependencies.
 *
 * If the requirements are not met and the dependencies cannot be installed, the process will exit.
 */
export function checkSystemRequirements() {
	// llvm
	if (!isExecutableAvailable(`llvm-config-${llvmVersion}`) && !isExecutableAvailable('llvm-config')) {
		console.error('llvm-config not found. Installing llvm...');
		const installed = installProgram(`llvm-${llvmVersion}`, () => {
			if (process.platform === 'win32') {
				return [`choco install llvm --version=${llvmVersionForChoco}`];
			}

			if (!isExecutableAvailable('wget')) {
				console.error('wget not found. Installing wget...');
				installProgram('wget');
			}

			return ['wget https://apt.llvm.org/llvm.sh', 'chmod +x llvm.sh', `sudo ./llvm.sh ${llvmVersion}`];
		});

		if (!installed) {
			process.exit(1);
		}
	}

	// gcc
	if (!isExecutableAvailable('gcc')) {
		console.error('gcc not found. Installing gcc...');
		const installed = installProgram('gcc', () => {
			if (process.platform === 'win32') {
				return ['choco install mingw']; // the package is called mingw, but the executable is gcc
			}
		});

		if (!installed) {
			process.exit(1);
		}
	}
}

/**
 * Checks if an executable is available.
 *
 * @param programName To check
 * @returns boolean
 */
export function isExecutableAvailable(programName: string): boolean {
	const command = process.platform === 'win32' ? 'where' : 'which';
	try {
		execSync(`${command} ${programName}`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Attempts to install a program.
 *
 * @param programName To install
 * @param installationCommands Optional callback to return the commands to install the program.
 *   If not provided, or if it returns undefined, it will try to install using the preferred package manager.
 * @returns
 */
function installProgram(programName: string, installationCommands?: () => string[] | undefined): boolean {
	try {
		if (typeof installationCommands === 'function') {
			const commands = installationCommands();
			if (typeof commands !== 'undefined' && commands.length > 0) {
				console.log(`Installing ${programName}...`);
				commands.forEach((command) => {
					execSync(command);
				});

				return true;
			}
		}

		// otherwise, install using preferred package manager
		switch (process.platform) {
			case 'win32':
				execSync(`choco install ${programName}`);
				break;
			case 'darwin':
				execSync(`brew install ${programName}`);
				break;
			case 'linux':
				if (isExecutableAvailable('apt')) {
					execSync(`sudo apt install ${programName}`);
				} else if (isExecutableAvailable('yum')) {
					execSync(`sudo yum install ${programName}`);
				} else if (isExecutableAvailable('dnf')) {
					execSync(`sudo dnf install ${programName}`);
				} else if (isExecutableAvailable('zypper')) {
					execSync(`sudo zypper install ${programName}`);
				} else if (isExecutableAvailable('pacman')) {
					execSync(`sudo pacman -S ${programName}`);
				} else {
					console.log('Unsupported package manager.');
					return false;
				}
				break;
			default:
				console.log('Unsupported platform.');
				return false;
				break;
		}

		return true;
	} catch (error) {
		console.error(`Failed to install ${programName}.`);
		return false;
	}
}
