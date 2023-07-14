import { execSync } from 'child_process';

const llvmVersion = 14;
const llvmVersionForChoco = '14.0.6';

const system = {
	/**
	 * Checks if the system requirements are met.
	 *
	 * If the requirements are not met, a helpful Error will be thrown.
	 */
	checkRequirements() {
		// llvm
		if (!this.isExecutableAvailable(`llvm-config-${llvmVersion}`) && !this.isExecutableAvailable('llvm-config')) {
			const commands = this.installationCommandsForProgram(`llvm-${llvmVersion}`, () => {
				if (process.platform === 'win32') {
					return [`choco install llvm --version=${llvmVersionForChoco}`];
				}

				const commands = [];
				if (!this.isExecutableAvailable('wget')) {
					commands.push(...this.installationCommandsForProgram('wget'));
				}

				commands.push('wget https://apt.llvm.org/llvm.sh', 'chmod +x llvm.sh', `sudo ./llvm.sh ${llvmVersion}`);

				return commands;
			});

			let errorMessage = 'Joelang needs llvm to compile your code.';
			if (commands.length > 0) {
				errorMessage += ` You may install it by running the following command(s):\n\n${commands.join('\n')}`;
			} else {
				errorMessage += ' Please install it manually. See https://releases.llvm.org/';
			}

			throw new Error(errorMessage);
		}

		// gcc
		if (!this.isExecutableAvailable('gcc')) {
			const commands = this.installationCommandsForProgram('gcc', () => {
				if (process.platform === 'win32') {
					return ['choco install mingw']; // the package is called mingw, but the executable is gcc
				}
			});

			let errorMessage = 'Joelang needs gcc to compile your code.';
			if (commands.length > 0) {
				errorMessage += ` You may install it by running the following command(s):\n\n${commands.join('\n')}`;
			} else {
				errorMessage += ' Please install it manually. See https://gcc.gnu.org/install/';
			}

			throw new Error(errorMessage);
		}
	},

	/**
	 * Checks if an executable is available.
	 *
	 * @param programName To check
	 * @returns boolean
	 */
	isExecutableAvailable(programName: string): boolean {
		const command = process.platform === 'win32' ? 'where' : 'which';
		try {
			execSync(`${command} ${programName}`);
			return true;
		} catch {
			return false;
		}
	},

	/**
	 * Attempts to install a program.
	 *
	 * @param programName To install
	 * @param installationCommands Optional callback to return the commands to install the program.
	 *   If not provided, or if it returns undefined, it will try to install using the preferred package manager.
	 * @returns
	 */
	installationCommandsForProgram(programName: string, installationCommands?: () => string[] | undefined): string[] {
		if (typeof installationCommands === 'function') {
			const commands = installationCommands();
			if (typeof commands !== 'undefined' && commands.length > 0) {
				return commands;
			}
		}

		// otherwise, install using preferred package manager
		switch (process.platform) {
			case 'win32':
				return [`choco install ${programName}`];
				break;
			case 'darwin':
				return [`brew install ${programName}`];
				break;
			case 'linux':
				switch (true) {
					case this.isExecutableAvailable('apt'):
						return [`sudo apt install ${programName}`];
					case this.isExecutableAvailable('yum'):
						return [`sudo yum install ${programName}`];
					case this.isExecutableAvailable('dnf'):
						return [`sudo dnf install ${programName}`];
					case this.isExecutableAvailable('zypper'):
						return [`sudo zypper install ${programName}`];
					case this.isExecutableAvailable('pacman'):
						return [`sudo pacman -S ${programName}`];
				}
				break;
		}

		return [];
	},
};

export const llcCommand = system.isExecutableAvailable(`llc-${llvmVersion}`) ? `llc-${llvmVersion}` : 'llc';

export default system;
