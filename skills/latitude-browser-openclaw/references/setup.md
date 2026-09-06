# Setup

This skill is meant for the current stable integration path:

- Latitude Browser owns browser profiles, proxy bindings, browser cores, and instance startup.
- OpenClaw owns conversation flow and browser-tool attachment.
- The bridge between them is Latitude Browser LaunchServer plus a remote CDP browser profile in OpenClaw.

## Preconditions

1. Latitude Browser must be running on the same machine as the OpenClaw Gateway.
2. Latitude Browser LaunchServer should use a fixed port for stability. The project default is `19876`.
3. If API auth is enabled in Latitude Browser, the protocol header remains `X-Ant-Api-Key`; this is a legacy wire-compatibility name, not the product name.
4. OpenClaw Browser must be enabled.

## Latitude Browser config

Latitude Browser already defaults to a fixed LaunchServer port:

```yaml
launch_server:
  port: 19876
  auth:
    enabled: false
    api_key: ""
    header: X-Ant-Api-Key
```

If you enable auth, keep the API key outside prompts and commit history.

## OpenClaw config

Use a remote CDP browser profile that points to the Latitude Browser LaunchServer URL.

If you want the skill files copied into an existing OpenClaw installation and the config merged automatically, use one of the bundled install scripts first.

Windows:

```powershell
pwsh -File skills/latitude-browser-openclaw/scripts/install_latitude_browser_openclaw.ps1 `
  -SetDefaultProfile
```

If auto-detection does not find the OpenClaw path, use:

```powershell
pwsh -File skills/latitude-browser-openclaw/scripts/install_latitude_browser_openclaw.ps1 `
  -TargetSkillsDir "C:\path\to\openclaw\skills" `
  -ConfigFile "C:\path\to\openclaw\openclaw.json" `
  -SetDefaultProfile
```

Linux:

```bash
bash skills/latitude-browser-openclaw/scripts/install_latitude_browser_openclaw.sh \
  --set-default-profile
```

If auto-detection does not find the OpenClaw path, use:

```bash
bash skills/latitude-browser-openclaw/scripts/install_latitude_browser_openclaw.sh \
  --target-skills-dir /path/to/openclaw/skills \
  --config-file /path/to/openclaw/openclaw.json \
  --set-default-profile
```

The install scripts:

- copy the full `latitude-browser-openclaw` skill folder into the target `skills` directory
- back up an existing skill folder before replacing it
- optionally merge the browser profile and skill entry into `openclaw.json`
- preserve existing config fields outside the Latitude Browser related sections

```json
{
  "browser": {
    "enabled": true,
    "defaultProfile": "latitude-browser",
    "profiles": {
      "latitude-browser": {
        "cdpUrl": "http://127.0.0.1:19876",
        "color": "#0F766E"
      }
    }
  },
  "skills": {
    "entries": {
      "latitude-browser-openclaw": {
        "enabled": true,
        "env": {
          "LATITUDE_BROWSER_BASE_URL": "http://127.0.0.1:19876",
          "LATITUDE_BROWSER_API_HEADER": "X-Ant-Api-Key"
        }
      }
    }
  }
}
```

If Latitude Browser auth is enabled, add either:

```json
{
  "skills": {
    "entries": {
      "latitude-browser-openclaw": {
        "apiKey": "replace-with-your-latitude-browser-api-key"
      }
    }
  }
}
```

or an equivalent secret reference supported by OpenClaw.

## 手动检查

1. Start Latitude Browser.
2. Verify LaunchServer:

```bash
curl http://127.0.0.1:19876/api/health
```

3. Launch a profile by exact code:

```bash
curl http://127.0.0.1:19876/api/launch/YOUR_CODE
```

4. Verify CDP discovery after a successful launch:

```bash
curl http://127.0.0.1:19876/json/version
```

5. In OpenClaw, use the `latitude-browser` browser profile to attach.

6. 在 attach 前，如需确认统一 CDP 入口当前指向谁：

```bash
curl http://127.0.0.1:19876/api/runtime/active
```

## Known limits in the current phase

- LaunchServer is loopback-only. This first phase is for same-host setups.
- LaunchServer currently exposes `health`, `profiles`, exact-ID `status/stop`, `runtime active`, selector-based `runtime status/stop`, `launch`, and `launch logs`.
- 选择器式 runtime control 当前只支持单目标控制，默认 `matchMode=unique`，显式只允许 `unique` 或 `first`。
- `browser stop` in OpenClaw only detaches from remote CDP. It does not stop the Latitude Browser instance itself.
