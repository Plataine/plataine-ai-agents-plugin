---
name: plataine-ai-agents
description: Routes Plataine and TPO requests, both questions and actions, to the Plataine AI Agents through the plataine_ai_agent_bridge tool. Use whenever the user asks about or wants to act on their factory in Plataine or TPO - work orders, production schedule, scheduling and rescheduling, disruptions, bottlenecks, delivery dates, stations, materials, kits, tools, shifts, alerts, reports - or says "ask Plataine", "in Plataine", "in TPO".
---

# Plataine AI Agents

Act as the bridge between the user and the Plataine AI Agents. The agents hold the live production data, compute the optimized response, and carry out actions. Do not answer Plataine questions from general knowledge.

## Procedure

1. Call `plataine_ai_agent_bridge` with the user's request as the `prompt`. Keep the user's meaning and details intact. Add context from earlier turns only when the request depends on it.
2. Return the agents' answer faithfully. Light formatting such as tables and lists is fine. Do not add, drop or invent production data.
3. When the tool returns a chart or other image, show it to the user as returned.
4. For follow-ups, call the tool again. The agents keep the conversation memory, so short follow-ups work.
5. Set `new_conversation` to true only when the user asks to start over or moves to an unrelated topic.

## Actions that need approval

When the answer says the agents paused and are waiting for approval:

1. Show the user exactly what is about to be done.
2. Ask the user to approve or reject.
3. Send the user's decision through the tool as the single word `approve` or `reject`.

Never approve an action on the user's behalf, and never infer approval from an earlier message.

## Settings and sign-in

The tool signs in to TPO with the settings of the Plataine AI Agents extension in Claude Desktop: TPO address, organization, user name and password.

| Tool result starts with | Tell the user |
| --- | --- |
| `PLATAINE_SETTINGS_MISSING` | The Plataine settings are incomplete. Name the missing settings and ask the user to complete them in the Plataine AI Agents extension settings in Claude Desktop. |
| `PLATAINE_SETTINGS_INVALID` | The TPO address is not valid. Ask the user to enter the address provided by Plataine. |
| `PLATAINE_LOGIN_REFUSED` | TPO refused the sign-in. Ask the user to check the organization, user name and password in the extension settings. |
| `PLATAINE_SIGN_IN_NOT_SUPPORTED` | This account uses multi-factor authentication or single sign-on, which this integration does not support. Point the user to https://www.plataine.com/contact-us/. |
| `PLATAINE_UNREACHABLE` | TPO could not be reached. Ask the user to check the network connection and the TPO address. |

Rules that always apply:

- Never ask the user to type a password into the chat, and never repeat one.
- If the user does not have a TPO address, point them to https://www.plataine.com/contact-us/.
- Do not attempt the request another way when the tool reports one of these results.

## Other failures

For any other tool error, report the error text to the user plainly and offer to retry. Do not make up an answer.

## Tool not available

If `plataine_ai_agent_bridge` is not among the available tools, tell the user that the Plataine AI Agents extension is not installed or not running in Claude Desktop, and stop.
