#!/usr/bin/env python3
"""Optional QLoRA fine-tuning for MarketLink. Never uploads or deploys weights."""
import argparse
from pathlib import Path

import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)
from trl import SFTConfig, SFTTrainer
from peft import LoraConfig

ROOT = Path(__file__).resolve().parents[1]
MODEL = "Qwen/Qwen3-4B-Instruct-2507"
DATA = ROOT / "datasets" / "marketlink_seed.jsonl"
OUT = ROOT / "artifacts" / "marketlink-qwen3-4b-qlora"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--train", action="store_true")
    parser.add_argument("--max-steps", type=int, default=0,
                        help="Optional capped pilot steps; 0 uses configured epochs.")
    parser.add_argument("--epochs", type=float, default=3.0)
    parser.add_argument("--max-length", type=int, default=1024)
    args = parser.parse_args()
    if args.dry_run == args.train:
        parser.error("Choose exactly one: --dry-run or --train")
    if args.max_steps < 0 or args.epochs <= 0 or args.max_length < 128:
        parser.error("Invalid training limits")

    ds = load_dataset("json", data_files=str(DATA), split="train")
    if len(ds) < 20:
        raise SystemExit("Refusing to train: at least 20 reviewed examples are required.")
    if args.dry_run:
        print(f"Dataset loaded: {len(ds)} examples; base model: {MODEL}")
        print(f"CUDA available: {torch.cuda.is_available()}")
        print("Dry run only. No model download, GPU training, artifact write or deployment.")
        return
    if not torch.cuda.is_available():
        raise SystemExit("CUDA GPU required. No CPU fallback will be attempted.")
    if torch.cuda.get_device_properties(0).total_memory < 16 * 1024**3:
        raise SystemExit("At least 16 GB GPU memory is required for this QLoRA pilot.")

    tokenizer = AutoTokenizer.from_pretrained(MODEL, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    quant = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
        bnb_4bit_use_double_quant=True,
    )
    model = AutoModelForCausalLM.from_pretrained(
        MODEL,
        quantization_config=quant,
        device_map="auto",
        trust_remote_code=True,
    )
    model.config.use_cache = False
    lora = LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.05,
        bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    )
    config = SFTConfig(
        output_dir=str(OUT),
        num_train_epochs=args.epochs,
        max_steps=args.max_steps if args.max_steps else -1,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=1e-4,
        warmup_ratio=0.05,
        logging_steps=1,
        save_strategy="epoch",
        report_to="none",
        max_length=args.max_length,
        packing=False,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        bf16=torch.cuda.is_bf16_supported(),
        fp16=not torch.cuda.is_bf16_supported(),
        optim="paged_adamw_8bit",
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
    print(f"Adapter saved locally to {OUT}. This script does not publish or deploy it.")

if __name__ == "__main__":
    main()
