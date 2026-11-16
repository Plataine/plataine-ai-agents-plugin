# Security

## Reporting a vulnerability

Report a suspected vulnerability through the [Plataine contact page](https://www.plataine.com/contact-us/) and mark the message "Security". Please do not open a public issue for a security problem.

Include the version you use, what you observed, and the steps to reproduce it.

## Supported versions

Security fixes are made to the latest released version.

## How credentials and data are handled

- **Nothing is built in.** The repository and the install files contain no Plataine address and no credential.
- **Your settings stay on your computer.** The TPO address, organization and user name are stored by Claude Desktop. The password is stored in the secure storage of your operating system.
- **The password goes to one place.** It is sent only to the TPO address you configured, over HTTPS, to sign in. An address that is not HTTPS is refused.
- **Your own permissions apply.** The extension signs in as you. The Plataine AI Agents can read and change only what your TPO role allows, and every request is recorded in the TPO audit trail under your user.
- **Approval stays with you.** Actions that need approval are shown in Claude and run only after you approve them.
- **No other destinations.** The extension contacts your TPO environment and nothing else. It has no telemetry and no dependencies.

Your questions and the agents' answers pass through Claude, and are subject to your organization's agreement with Anthropic.
