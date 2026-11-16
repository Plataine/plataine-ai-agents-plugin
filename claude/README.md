# Setup guide for Claude Desktop

This guide installs the Plataine AI Agents plugin for Claude on Windows or macOS. It takes two installs: the Desktop extension, which connects to your TPO environment, and the plugin, which teaches Claude how to work with the Plataine AI Agents.

## Before you start

You need:

- Claude Desktop, signed in.
- The address of your TPO environment. [Contact Plataine](https://www.plataine.com/contact-us/) if you do not have it.
- Your TPO organization, user name and password. Accounts that use single sign-on or multi-factor authentication are not supported.
- The two install files, from the [Releases page](https://github.com/Plataine/plataine-ai-agents-plugin/releases) or built with `npm run build`:
  - `plataine-ai-agents.mcpb`
  - `plataine-ai-agents-plugin.zip`

## 1. Install the Desktop extension

1. In Claude Desktop, open **Settings > Extensions**.
2. Select **Advanced settings**, then **Install Extension...** in the Extension Developer section.
3. Choose `plataine-ai-agents.mcpb` and confirm the install.
4. Fill in the settings:

| Setting | Value |
| --- | --- |
| TPO address | The address provided by Plataine, starting with `https://` |
| Organization | The organization you enter on the TPO sign-in page |
| User name | Your TPO user name |
| Password | Your TPO password |

5. Make sure the extension is enabled.

The password is kept in the secure storage of your operating system. It is sent only to your TPO environment.

## 2. Add the plugin

1. In Claude Desktop, open **Customize > Plugins**.
2. Select **Add**, then **Upload plugin**.
3. Choose `plataine-ai-agents-plugin.zip`.

## 3. Try it

Start a new chat and ask:

> Show today's work orders in Plataine.

Claude sends the request to the Plataine AI Agents and shows their answer. Follow-up questions continue the same conversation with the agents.

## Organizations on Claude Team and Enterprise plans

An owner can make the extension available to everyone in the organization for a one-click install, and can restrict which extensions and plugins members may add. If the install options above are not available to you, ask your Claude administrator.

## Approving actions

When the agents need approval before they act, Claude shows what is about to be done and asks you to approve or reject. Nothing is changed in TPO until you approve.

## Troubleshooting

| Claude says | What to do |
| --- | --- |
| The Plataine settings are incomplete | Open **Settings > Extensions > Plataine AI Agents** and fill in the missing settings. |
| The TPO address is not valid | Enter the full address provided by your Plataine's account manager, starting with `https://`. |
| TPO refused the sign-in | Check the organization, user name and password. Sign in to TPO in your browser to confirm they work. |
| This account type is not supported | Your account uses single sign-on or multi-factor authentication. [Contact Plataine](https://www.plataine.com/contact-us/). |
| TPO could not be reached | Check your network connection, VPN and the TPO address. |
| The Plataine AI Agents extension is not installed or not running | Repeat step 1 and make sure the extension is enabled. |

## Update

In case of an update (new releases), install the newer `plataine-ai-agents.mcpb` over the existing extension, and upload the newer `plataine-ai-agents-plugin.zip`. Your settings may need to be entered again.

## Remove

To remove the plugin, remove **Plataine AI Agents** under **Settings > Extensions** and under **Customize > Plugins**.
