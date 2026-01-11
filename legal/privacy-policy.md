# Privacy Policy - Moderation+

**Effective date:** 2026-01-11  
**Last updated:** 2026-01-11

Moderation+ (“the Bot”) is an open-source Discord moderation bot developed and maintained by an independent developer (“we”, “us”, “our”).

This Privacy Policy explains what data the Bot processes, why it processes it, where it is stored, and what choices server administrators and users have.

If you have questions, contact: **dk21eve@gmail.com**

---

## 1. What data Moderation+ stores

Moderation+ is designed to store **configuration**, not user content.

Depending on which features a Discord server enables, the Bot may store the following **server configuration data**:

- Discord **server (guild) ID**
- IDs for configured **channels** (e.g., log channel, welcome channel, starboard channel)
- IDs for configured **roles** (e.g., moderator roles, auto-role targets, role panel roles)
- Feature settings (thresholds, toggles, modes, emojis, timezones, labels, etc.)
- Starboard and feature configuration (watched channels, thresholds, emojis, options)
- Time-channel configuration (timezones, labels, channel IDs linked to clocks)

The Bot does **not** store message content as a database of chat logs.

---

## 2. Data that may be stored for moderation features

If a server enables moderation features, Moderation+ may store limited moderation-related records such as:

- **User IDs** associated with warnings/timeouts (for example: warnings list entries)
- The **reason** text entered by moderators for a warning/timeout (if provided)
- Timestamps related to moderation actions (when an action was created/applied)

These records exist only to provide moderation history and functionality **inside the server where the action occurred**.

Moderation+ does not attempt to build profiles across servers.

---

## 3. What Moderation+ does NOT store

Moderation+ does not intentionally store:

- Full message history or archives of chat
- Private messages (DMs) between users
- Passwords, payment details, or financial information
- Real-world identity information (name, address, etc.)

---

## 4. What Moderation+ processes in real-time (without storing)

To function on Discord, the Bot necessarily **processes** certain events in real-time, which may include:

- Message events (to detect deletes/edits for logging, or to apply auto-react rules)
- Reaction and interaction events (for starboard updates, role buttons, etc.)
- Member join/leave events (for welcomes, invite tracking, stats)
- Role and member updates (for logs and role panel changes)

“Processes” means the Bot reads the event payload and acts on it. It does not mean the Bot stores everything it reads.

---

## 5. Where data is stored

Moderation+ stores its persistent data in **JSON files** on the hosting environment used by the Bot instance.

For hosted deployments (for example on Railway), this may be stored on a mounted persistent volume (commonly mounted at `/app/data`).

Data is scoped per Bot instance and per server configuration.

---

## 6. Who can access the stored data

- The primary people with access are the Bot maintainer(s) and the server administrators who configure the Bot.
- Server administrators can view and manage configuration through the Bot’s commands and server settings.
- Moderation logs are posted in channels chosen by server administrators.

Moderation+ does not sell data or provide data to third parties for advertising.

---

## 7. Data retention

Configuration and moderation records remain stored **until**:

- A server administrator removes/clears the configuration or the related feature data, or
- The server removes the Bot, or
- The Bot is reset/redeployed and the persistent storage is deleted.

Because the Bot is open-source and can be self-hosted, retention may vary depending on how a particular server hosts and manages the Bot.

---

## 8. User rights and removal requests

If you are a server member and want moderation records relating to you removed, you should contact the **server administrators** first, as they control whether features are enabled and how they are used.

If you are a server owner/admin and want data removed from a hosted instance maintained by us, contact:
**dk21eve@gmail.com**

We will make reasonable efforts to assist with removal requests for deployments we control. For self-hosted deployments, the server operator is responsible for data handling.

---

## 9. Legal basis (GDPR / UK GDPR)

Moderation+ processes limited Discord identifiers and configuration data to provide server moderation and automation features.

For servers in the UK/EU, this processing is generally based on:

- **Legitimate interests** (operating moderation/automation features requested by server administrators), and/or
- **Performance of a contract/service** (providing the Bot’s functions to the server)

Server administrators are responsible for ensuring their own server policies and moderation practices comply with applicable laws.

---

## 10. Donations and monetization

Moderation+ may accept **optional donations** to support development and hosting.

Donations are voluntary and do not change how data is processed.

---

## 11. Third-party services

Moderation+ runs on Discord and uses Discord’s API. Discord independently collects and processes data under its own policies.

You should review Discord’s Privacy Policy separately.

Moderation+ may also be hosted on third-party infrastructure providers (such as Railway), who may process operational data (logs, uptime metrics) under their own policies.

---

## 12. Changes to this Privacy Policy

We may update this Privacy Policy to reflect feature changes or legal requirements.

When changes are made, the “Last updated” date at the top will be revised.

---

## 13. Contact

For privacy questions or removal requests for deployments we control:

**dk21eve@gmail.com**
