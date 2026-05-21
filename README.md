# Text-to-CAD Web

A browser workbench for running Codex CLI with
[earthtojake/text-to-cad](https://github.com/earthtojake/text-to-cad). It provides:

- one-click `codex login --device-auth` and displays the verification URL and user code
- a Chinese creation page with selectable bundled CAD Skills and skill-tagged demos
- a server-side Codex job runner that writes final files to `./outputs`
- an artifacts page for previewing and downloading generated CAD outputs

## Local setup

```bash
npm install
npm run setup:viewer
npm run setup:codex
npm run dev
```

Open <http://localhost:3000>. The app stores Codex auth, job logs, and generated
files under `var/` by default. Override that path with `TEXT_TO_CAD_DATA_DIR`.
Bundled `earthtojake/text-to-cad` skills are seeded into the runtime Codex home
automatically before generation jobs run, so local setup does not need a network
`skills add` step.

`setup:codex` also creates a CAD Python venv under
`~/.cache/text-to-cad-web/cad-python` and installs the CAD skill Python
dependencies (`build123d`, `ezdxf`, `numpy`, `trimesh`, `vtk`, and the OCP stack
pulled by build123d). Runtime jobs prepend that venv to `PATH`, so skill commands
such as `python skills/cad/scripts/step ...` use the bundled CAD environment by
default. Override it with `TEXT_TO_CAD_PYTHON_VENV` or `TEXT_TO_CAD_PYTHON`.

CAD and mesh previews use the vendored CAD Explorer from
`vendor/cad-viewer`. If you set a custom viewer checkout, point
`TEXT_TO_CAD_VIEWER_DIR` at its package directory.

## Docker

The Docker image installs the Codex CLI, bundles all `earthtojake/text-to-cad`
skills into the image, seeds them into the runtime Codex home on startup, and
installs the vendored CAD Explorer dependencies during build.

```bash
docker build -t text-to-cad-web .
docker run --rm -p 3000:3000 -p 4178:4178 -v "$PWD/data:/data" text-to-cad-web
```

Then open <http://localhost:3000> and use **OAuth**. The login route runs:

```bash
codex login --device-auth
```

The device URL and user code are displayed in the web UI while the CLI waits for
authorization.

## Runtime model

Each generation creates a job directory:

```text
var/jobs/<job-id>/
  prompt.md
  codex.log
  last-message.md
  outputs/
```

The Codex prompt requires all final user-facing files to be placed in
`outputs/`, where the artifacts page can serve them for download.

## Upstream attribution

Prompt examples are adapted from the benchmark table and bundled skill set in
`earthtojake/text-to-cad`, which is MIT licensed.

## License

This project is source-available for non-commercial use only. Commercial use
requires prior written authorization from CodeEagle. See [LICENSE](LICENSE).

Vendored dependencies and upstream CAD Skills retain their own licenses.
