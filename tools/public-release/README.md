Public release tools.

- `publish-public.bat`: one-click publish to public `main`
- `publish-public.ps1`: manual entrypoint

Release snapshot safety:

- replaces `config.yaml` with `publish/config.init.yaml`
- excludes `docs/`, `DEPLOYMENT_GUIDE.md`, `plan.md`, `pic/`, `data/`, `build/bin/`, local IDE folders

Usage:

```bat
tools\public-release\publish-public.bat
tools\public-release\publish-public.bat -Version 1.1.0
```

Custom commit message:

```bat
tools\public-release\publish-public.bat -CommitMessage "release: public snapshot 1.2.3"
```

Or load a multi-line message from a file:

```powershell
.\tools\public-release\publish-public.ps1 -CommitMessageFile .\publish-message.txt
```

Behavior:

- the source ref and public target branch default to `main`; override them with `-SourceRef` and `-TargetBranch` when needed
- public `main` keeps history and appends one aggregated commit per publish
- interactive mode supports overriding the publish version before deciding whether to publish `release/<version>` and `v<version>`
- the script shows console options for the selected target branch: `main` / `main+release` / `main+tag` / `main+release+tag` by default
- running the script will publish directly; use `-DryRun` only when you explicitly want a no-push preview
- command line switches are kept only for automation/manual override
