#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import pdfplumber


@dataclass(frozen=True)
class ExtractResult:
    headers: list[str]
    rows: list[list[str]]


def _normalize_cell(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    return " ".join(text.replace("\r", "\n").split())


def extract_first_table_from_all_pages(pdf_path: Path) -> ExtractResult:
    headers: list[str] | None = None
    rows: list[list[str]] = []

    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables() or []
            if not tables:
                continue
            table = tables[0]
            if not table:
                continue

            page_headers = [_normalize_cell(h) for h in (table[0] or [])]
            page_rows = table[1:]

            if headers is None:
                headers = page_headers
            else:
                # Some exports repeat header; ignore if it matches
                if page_headers != headers and any(page_headers):
                    # If the header changes, prefer the first but keep parsing
                    pass

            for row in page_rows:
                if row is None:
                    continue
                norm = [_normalize_cell(c) for c in row]
                if not any(norm):
                    continue
                rows.append(norm)

    if headers is None:
        raise RuntimeError(f"No tables found in {pdf_path}")

    return ExtractResult(headers=headers, rows=rows)


def rows_as_dicts(headers: list[str], rows: list[list[str]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for row in rows:
        # Pad/trim to header length
        padded = (row + [""] * len(headers))[: len(headers)]
        out.append({headers[i]: padded[i] for i in range(len(headers))})
    return out


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extrai a primeira tabela de cada página de um PDF e salva em JSON."
    )
    parser.add_argument("--products-pdf", type=Path, required=True)
    parser.add_argument("--clients-pdf", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, default=Path("data"))
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)

    products = extract_first_table_from_all_pages(args.products_pdf)
    clients = extract_first_table_from_all_pages(args.clients_pdf)

    (args.out_dir / "products.raw.json").write_text(
        json.dumps(
            {
                "headers": products.headers,
                "rows": products.rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (args.out_dir / "clients.raw.json").write_text(
        json.dumps(
            {
                "headers": clients.headers,
                "rows": clients.rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    (args.out_dir / "products.json").write_text(
        json.dumps(rows_as_dicts(products.headers, products.rows), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (args.out_dir / "clients.json").write_text(
        json.dumps(rows_as_dicts(clients.headers, clients.rows), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("Wrote:", args.out_dir / "products.json")
    print("Wrote:", args.out_dir / "clients.json")


if __name__ == "__main__":
    main()
