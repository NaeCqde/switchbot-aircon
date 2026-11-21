# switchbot-aircon

[日本語](README.md) | English

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run start
```

This project was created using `bun init` in bun v1.3.6. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Where the settings are read from

`.env`: the current directory is searched first. If the file is there, only that one is read; if not, the one in the directory of the executable is read.
