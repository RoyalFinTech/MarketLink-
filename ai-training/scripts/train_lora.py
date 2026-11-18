#!/usr/bin/env python3
"""Optional supervised LoRA fine-tuning. Does not publish or deploy weights."""
import argparse
from pathlib import Path
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer
from peft import LoraConfig

ROOT = Path(__file__).resolve().parents[1]
MODEL = "Qwen/Qwen3-4B-Instruct-2507"
DATA = ROOT / "datasets" / "marketlink_seed.jsonl"
OUT = ROOT / "artifacts" / "marketlink-qwen3-4b-lora"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--train", action="store_true")
    args = parser.parse_args()
    if args.dry_run == args.train:
        parser.error("Choose exactly one: --dry-run or --train")
    ds = load_dataset("json", data_files=str(DATA), split="train")
    if args.dry_run:
        print(f"Dataset loaded: {len(ds)} examples; base model: {MODEL}")
        print("Dry run only. No GPU training, model download, artifact write or deployment.")
        return
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL, torch_dtype="auto", device_map="auto"
    )
    lora = LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.05,
        bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    )
    config = SFTConfig(
        output_dir=str(OUT),
        num_train_epochs=3,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=2e-4,
        logging_steps=5,
        save_strategy="epoch",
        report_to="none",
        max_length=2048,
        packing=False,
    )
    trainer = SFTTrainer(
        model=model,
        args=config,
        train_dataset=ds,
        peft_config=lora,
        processing_class=tokenizer,
    )
    trainer.train()
    trainer.save_model(str(OUT))
    tokenizer.save_pretrained(str(OUT))
    print(f"Adapter saved locally to {OUT}. Review/evaluate before deployment.")

if __name__ == "__main__":
    main()
