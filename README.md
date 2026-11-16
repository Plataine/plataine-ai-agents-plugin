# Plataine AI Agents plugin for Claude

Plataine brings trusted, optimized factory-floor decisions and actions to Claude, powered by its PractimumOptimum™ AI technology.

The Plataine AI Agents plugin connects Claude to Plataine's Total Production Optimization (TPO) suite of AI Agents. Teams ask Claude what is happening in their factory and what to do about it. Plataine's AI Agents compute the response from live production data, and actions that need approval are shown in Claude before they run, all without leaving the conversation.

## Why it is different

**From insight to action.** Plataine's AI Agents turn live shop-floor data into an answer, a recommendation or an action, which authorized users approve and execute from Claude.

**Decisions come from Plataine, not from the language model.** Claude does not compute the plan. It passes the request to Plataine's AI Agents, which work with Plataine's optimization technology and the real state of the factory, and it relays their answer unchanged.

**Controlled action.** Every request runs with the signed-in user's own TPO permissions and is recorded in the TPO audit trail. When the agents need approval for an action, Claude shows what is about to be done and waits for the user's decision.

**Built for complex manufacturing.** Plataine is purpose-built for high-mix, highly regulated production in aerospace and defense, automotive and industrial manufacturing.

## What you can ask

Ask in plain language, the way you would ask a colleague:

- "Show today's work orders."
- "How many work orders do we have, by status?"
- "Show a bar chart of work orders by due date month."
- "What is on the production schedule this week?"
- "Schedule the open work orders."

The agents answer from your organization's live TPO data: work orders, the production schedule, stations and locations, materials, kits, tools, shifts, alerts and reports. What is available to you depends on the AI Agents enabled for your organization and on your TPO role.

## How it works

```
Claude Desktop  ->  Plataine AI Agents extension  ->  your TPO environment  ->  Plataine AI Agents
                    (runs on your computer)           (sign-in, permissions,    (compute the answer)
                                                       audit trail)
```

The repository holds the two parts that run on the customer side:

| Part | What it does |
| --- | --- |
| [Claude plugin](claude/plugin) | Teaches Claude when to turn to the Plataine AI Agents, how to relay their answers, and how to handle approvals and sign-in problems. |
| [Claude Desktop extension](claude/desktop-extension) | Signs in to your TPO environment with your own account, sends each request to the agents, and returns the answer, including charts. |

Nothing in this repository contains a Plataine address or a credential. You enter the address of your TPO environment and your own account in the extension settings.

## Requirements

- A Plataine TPO cloud environment with AI Agents enabled.
- The address of your TPO environment. [Contact Plataine](https://www.plataine.com/contact-us/) to receive it.
- A TPO account that signs in with a user name and password. Accounts that use single sign-on or multi-factor authentication are not supported.
- Claude Desktop for Windows or macOS.

## Install

Follow the [setup guide](claude/README.md). In short:

1. Install the Plataine AI Agents extension in Claude Desktop and enter your TPO address, organization, user name and password.
2. Add the Plataine AI Agents plugin to Claude.
3. Ask Claude: "Show today's work orders in Plataine."

## Repository layout

```
claude/
  plugin/              Claude plugin (skill)
  desktop-extension/   Claude Desktop extension (MCP server)
  README.md            Setup guide
scripts/               Build and repository checks
test/                  Automated tests
```

The `claude/` folder holds everything specific to Claude.

## Build and test

Node.js 18 or later is the only requirement. There are no dependencies to install.

```
npm test         # run the automated tests against a local stand-in for TPO
npm run check    # verify that the repository holds no environment address or credential
npm run build    # write the two install files to dist/
```

## Security

See [SECURITY.md](SECURITY.md) for how credentials are handled and how to report a vulnerability.

## Contact

Questions, access to a TPO environment, and support: [plataine.com/contact-us](https://www.plataine.com/contact-us/).

## License

Licensed under the [Apache License, Version 2.0](LICENSE).

Plataine and PractimumOptimum are trademarks of Plataine Inc. Claude is a trademark of Anthropic, PBC. This plugin is developed and maintained by Plataine and is not affiliated with or endorsed by Anthropic.
