# MarketLink AI — private fine-tuning starter

## Purpose
This is the first reviewed seed corpus for a MarketLink-owned conversational model. It teaches response style, simple English, selected Gambian English/Pidgin-style phrasing, and safe navigation guidance for customers, vendors and riders.

It is **not** a trained model and it does not alter production responses by itself. The production assistant remains the deterministic knowledge/navigation system until a fine-tuned candidate passes evaluation and is explicitly enabled.

## Proposed base model
Initial candidate: `Qwen/Qwen3-4B-Instruct-2507` (Apache-2.0 model card; verify the upstream licence and terms again before each release). It is an open-weight model that can be self-hosted. MarketLink's own LoRA adapter can be trained without sending prompts to the OpenAI API.

## Training method
Supervised fine-tuning (SFT) with LoRA/QLoRA using Hugging Face Transformers, TRL and PEFT. QLoRA loads the base model in 4-bit NF4 and trains a small LoRA adapter while keeping base weights frozen. The pilot script requires CUDA and checks available VRAM before training.

## Data format
`datasets/marketlink_seed.jsonl` uses one JSON object per line with a `messages` array (system, user, assistant). All examples are synthetic seed examples, not copied customer conversations.

## Privacy and review rules
- Never put customer names, phone numbers, addresses, order IDs, PINs, OTPs, payment references, private messages or uploaded identity documents in this dataset.
- Do not export raw production chat logs into training data.
- Convert a support issue into a de-identified, human-reviewed example before adding it.
- A Gambian English/Pidgin speaker should review dialect examples before a model release. Do not label this seed as fluent in every Gambian language.
- Keep financial, order and delivery facts grounded in authenticated live backend tools, not memorized training examples.
- Safety examples are included to teach refusal style, but runtime safety filters and authorization checks must remain in place.

## Local smoke validation
Run:
```bash
python scripts/validate_dataset.py
```

## GPU fine-tuning
Create a clean Python 3.11/3.12 environment on a CUDA GPU host with at least 16 GB VRAM (24 GB recommended), then:
```bash
pip install -r requirements.txt
python scripts/train_lora.py --dry-run
```
After reviewing the dataset and confirming GPU availability, run a short capped pilot first:
```bash
python scripts/train_lora.py --train --max-steps 30 --epochs 1
```
The script saves only the adapter and tokenizer/config artifacts under `artifacts/marketlink-qwen3-4b-qlora`. It does not publish, upload or deploy them.

## Production rollout gate
1. Review/expand the corpus with native speakers and product owners.
2. Train an adapter on a GPU host.
3. Run the held-out evaluation set and safety regression tests.
4. Compare against the current production assistant for correctness, latency and refusal behavior.
5. Host the model privately behind authenticated service-to-service access.
6. Keep live account facts and actions in the backend tools; the model must not write financial records directly.
7. Enable by feature flag for internal admins first, then a small pilot. Roll back automatically on failures.

## Infrastructure note
Render's current MarketLink Free web service is not a GPU training machine. The model training job and inference server should be separate from the existing customer API. A GPU provider or Royal FinTech-owned GPU machine is required for practical fine-tuning and model serving. This repo only prepares a repeatable, provider-neutral training workflow; no paid GPU resources are provisioned by this change.
