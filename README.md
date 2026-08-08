# CRC AI Receptionist

Modular AI receptionist: phone + web chat sharing one brain, configured per client via the Deployment Kit.

## Start here

1. Read `BUILD-PLAN.md` for build order and the web chat module spec
2. Read `RECEPTIONIST-BUILD-SPEC.md` for architecture (refined from the Technical Guide)
3. Read `E:\shared programs\Business Model\CRC-Technical-Guide-Receptionist.md` for full module specs
4. Client config: `E:\shared programs\Business Model\Deployment Kit\clients\crc-solutions\`

## Validate config

```bash
npm run validate:client
# or:
pip install pyyaml
python "E:\shared programs\Business Model\Deployment Kit\validate.py" "E:\shared programs\Business Model\Deployment Kit\clients\crc-solutions"
```

## Dump assembled prompt (Phase 0)

```bash
npm run prompt:dump
```

## Related paths

| Path | Purpose |
|------|---------|
| `E:\shared programs\Business Model\Deployment Kit\` | Client YAML/MD configs |
| `E:\shared programs\Business Model\CRC-Technical-Guide-Receptionist.md` | Architecture and how-to-build |
| `docs/guide-vs-kit-precedence.md` | When Guide and Kit disagree, Kit wins |
| `E:\shared programs\Website\` | Chat widget frontend |
| `E:\shared programs\chatbot-update\new-nodes.json` | Legacy chat reference (flow + scoring) |

## Status

Phase 0 in progress: config loader + prompt assembler.
