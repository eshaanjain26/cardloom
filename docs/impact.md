# Token, cost, and CO2 meter

Cardloom records the input and output tokens the provider reports for every AI call (outline, card batches, agent edits, connection tests). Cost, energy, and CO2 are computed from those counts when they are shown, so changing a factor in **Settings** updates every total.

All energy and CO2 figures are **estimates**. Providers do not publish per-request energy, so the meter uses public per-query estimates scaled by token count. Treat the numbers as an order of magnitude, useful for comparing runs and models, not as a measurement.

## Formulas

```
cost   = input_tokens × input_price / 1e6 + output_tokens × output_price / 1e6
energy = input_tokens / 1000 × Wh_per_1k_input + output_tokens / 1000 × Wh_per_1k_output
co2    = energy / 1000 × grid_g_per_kWh
```

## Defaults and where they come from

| Factor | Default | Basis |
| --- | --- | --- |
| Wh per 1k output tokens | 0.6 | Epoch AI estimates a typical GPT-4o query at about 0.3 Wh ([Epoch AI, 2025](https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use)). Cardloom assumes that typical query produces about 500 output tokens. **The 500-token figure is Cardloom's assumption**, not Epoch's. |
| Wh per 1k input tokens | 0.22 | Epoch AI estimates a query with a 10,000-token input at about 2.5 Wh. Subtracting the 0.3 Wh base and spreading the rest over 10,000 tokens gives about 0.22 Wh per 1,000 input tokens. |
| Grid intensity (g CO2e per kWh) | 475 | Approximate global average electricity intensity from Ember's annual series. **Verify this against [Ember's data](https://ember-energy.org/) for the current year**, and set your own region's value. Data centers on cleaner grids or with clean-energy contracts will be much lower. |

For comparison, Google measured a median Gemini Apps text prompt at 0.24 Wh and 0.03 g CO2e in May 2025, using a method that includes idle capacity and data center overhead ([Google, 2025](https://arxiv.org/abs/2508.15734)). That is the same order of magnitude as the defaults above.

### Local models (Ollama)

Ollama runs are priced at $0. The same energy factors apply by default, which is a rough stand-in: a laptop GPU and a data center accelerator differ a lot. If you know your machine's draw, set the factors to match.

## Prices

Anthropic prices are built in (USD per million tokens, first-party API rates as of 2026-10-06):

| Model | Input | Output |
| --- | --- | --- |
| claude-fable-5-1 | 10.00 | 50.00 |
| claude-opus-5-5 | 4.00 | 20.00 |
| claude-opus-5 | 5.00 | 25.00 |
| claude-sonnet-5-5 | 2.00 | 10.00 |
| claude-sonnet-5 | 2.00 | 10.00 |
| claude-haiku-5-5 | 0.10 | 0.50 |

OpenAI, Google, and OpenRouter change prices often, so Cardloom ships none for them. Add a price per model in Settings; until then the meter shows "cost unknown" for those calls.
