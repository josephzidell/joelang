# Contributing to Joelang

Hello and welcome! Thank you for considering contributing to Joelang. We appreciate your time and effort, and we are excited to have you on board. This document will guide you through the process of contributing to the project.

## Table of Contents

- [Contributing to Joelang](#contributing-to-joelang)
	- [Table of Contents](#table-of-contents)
	- [Code of Conduct](#code-of-conduct)
	- [Getting Started](#getting-started)
	- [Setting Up Your Environment](#setting-up-your-environment)
	- [Submitting Changes](#submitting-changes)
	- [Testing and Linting](#testing-and-linting)
	- [Asking for Help](#asking-for-help)

## Code of Conduct

Please take a moment to review our [Code of Conduct](./CODE_OF_CONDUCT.md) to ensure that our community remains friendly, inclusive, and welcoming for everyone.

## Getting Started

1. **Fork the repository**: Start by forking the main Joelang repository. This will create your own copy of the repository, allowing you to make changes without affecting the main project.

2. **Clone your fork**: Clone your forked repository to your local machine using the following command:

	```
	git clone https://github.com/joseph_zidell/joelang.git
	```

3. **Create a new branch**: Create a new branch for your changes. Use a descriptive name for your branch, such as `feature/your-feature-name` or `fix/issue-description`.

	```
	git checkout -b YOUR_BRANCH_NAME
	```

## Setting Up Your Environment

To set up your development environment, follow these steps:

1. **Install dependencies**: Run the following command to install the necessary dependencies:

	```
	npm install
	```

2. **Build the project**: Run the following command to build the project:

	```
	npm run build
	```

## Submitting Changes

1. **Commit your changes**: Commit your changes to your branch with a descriptive commit message. Break down your changes into smaller, logically separate commits.

	```
	git add .
	git commit -m "Your descriptive commit message"
	```

2. **Push your changes**: Push your changes to your fork on GitHub.

	```
	git push origin YOUR_BRANCH_NAME
	```

3. **Create a pull request**: Head to your fork on GitHub and create a new pull request. Make sure to describe your changes and reference any issues that your changes address.

## Testing and Linting

Before submitting your changes, ensure that your code passes all tests and follows our coding standards.

1. **Run tests**: We use Jest for testing. Run the following command to execute the tests:

	```
	npm test
	```

2. **Lint your code**: We use ESLint for linting. Run the following command to check your code for issues:

	```
	npm run lint
	```

	If any issues are found, please fix them before submitting your pull request. You can also use the following command to automatically fix some linting issues:

	```
	npm run lint-fix
	```

## Asking for Help

If you need help or have any questions, don't hesitate to ask. You can reach out by creating an issue on GitHub.

Once again, thank you for your interest in contributing to Joelang! We look forward to collaborating with you and making this project even better.
