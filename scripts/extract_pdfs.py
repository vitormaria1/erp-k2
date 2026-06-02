#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import unicodedata
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


def _normalize_header(value: str) -> str:
    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    return re.sub(r"[^a-z0-9]+", "", text)


def _dedupe_headers(headers: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    out: list[str] = []
    for idx, raw in enumerate(headers):
        header = raw.strip() or f"Coluna {idx + 1}"
        count = seen.get(header, 0) + 1
        seen[header] = count
        out.append(header if count == 1 else f"{header} ({count})")
    return out


def _looks_like_header(row: list[str], key_header: str) -> bool:
    normalized = {_normalize_header(cell) for cell in row if cell}
    key_norm = _normalize_header(key_header)
    return key_norm in normalized or any(
        token in normalized
        for token in (
            "cnpj",
            "cpfcnpj",
            "nome",
            "nomefantasia",
            "cep",
            "endereco",
            "fone",
            "telefone",
            "email",
        )
    )


def _is_repeated_header(row: list[str], headers: list[str]) -> bool:
    if not row:
        return False
    normalized_row = [_normalize_header(cell) for cell in row]
    normalized_headers = [_normalize_header(cell) for cell in headers]
    matches = sum(
        1
        for idx, cell in enumerate(normalized_row[: len(normalized_headers)])
        if cell and cell == normalized_headers[idx]
    )
    return matches >= max(2, min(4, len(normalized_headers)))


def _iter_tables(pdf_path: Path) -> Iterable[tuple[int, list[list[str]]]]:
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables() or []
            for table in tables:
                normalized = [
                    [_normalize_cell(cell) for cell in (row or [])]
                    for row in (table or [])
                    if row is not None
                ]
                normalized = [row for row in normalized if any(row)]
                if normalized:
                    yield page_number, normalized


def _rows_as_dicts(headers: list[str], rows: list[list[str]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for row in rows:
        padded = (row + [""] * len(headers))[: len(headers)]
        out.append({headers[i]: padded[i] for i in range(len(headers))})
    return out


def extract_first_table_from_all_pages(pdf_path: Path) -> ExtractResult:
    headers: list[str] | None = None
    rows: list[list[str]] = []

    for _page_number, table in _iter_tables(pdf_path):
        page_headers = _dedupe_headers(table[0])
        page_rows = table[1:]

        if headers is None:
            headers = page_headers

        for row in page_rows:
            norm = (_normalize_cell(c) for c in row)
            row_values = list(norm)
            if not any(row_values):
                continue
            if headers and _is_repeated_header(row_values, headers):
                continue
            rows.append(row_values)

    if headers is None:
        raise RuntimeError(f"No tables found in {pdf_path}")

    return ExtractResult(headers=headers, rows=rows)


def extract_customer_tables_by_key(pdf_path: Path, key_header: str = "Cod.Cadastro") -> ExtractResult:
    """Extract customer tables that may be split horizontally across many PDF pages.

    Some ERP reports print a fixed group of customers over several pages so that
    each page shows a different subset of columns. This routine merges every
    table segment by ``key_header`` instead of treating each page as an isolated
    list, preserving all columns found across the report.
    """

    all_headers: list[str] = []
    header_norm_to_name: dict[str, str] = {}
    merged_by_key: dict[str, dict[str, str]] = {}
    order: list[str] = []
    current_headers: list[str] | None = None
    key_norm = _normalize_header(key_header)

    def register_headers(headers: list[str]) -> list[str]:
        deduped = _dedupe_headers(headers)
        canonical: list[str] = []
        for header in deduped:
            norm = _normalize_header(header)
            if not norm:
                canonical.append(header)
                continue
            name = header_norm_to_name.get(norm)
            if name is None:
                header_norm_to_name[norm] = header
                all_headers.append(header)
                canonical.append(header)
            else:
                canonical.append(name)
        return canonical

    for _page_number, table in _iter_tables(pdf_path):
        first_row = table[0]
        if _looks_like_header(first_row, key_header):
            current_headers = register_headers(first_row)
            data_rows = table[1:]
        elif current_headers is not None:
            data_rows = table
        else:
            continue

        if not current_headers:
            continue

        key_index = next(
            (idx for idx, header in enumerate(current_headers) if _normalize_header(header) == key_norm),
            None,
        )

        for row in data_rows:
            values = [_normalize_cell(c) for c in row]
            if not any(values):
                continue
            if _is_repeated_header(values, current_headers):
                continue

            key = values[key_index].strip() if key_index is not None and key_index < len(values) else ""
            if not key:
                # Without the registration code we cannot safely stitch a horizontal table segment.
                continue

            if key not in merged_by_key:
                merged_by_key[key] = {}
                order.append(key)

            record = merged_by_key[key]
            for idx, value in enumerate(values[: len(current_headers)]):
                if not value:
                    continue
                header = current_headers[idx]
                previous = record.get(header, "")
                if not previous or previous == value:
                    record[header] = value
                elif value not in previous.split(" | "):
                    record[header] = f"{previous} | {value}"

    if not all_headers:
        raise RuntimeError(f"No customer table headers found in {pdf_path}")

    rows = [[merged_by_key[key].get(header, "") for header in all_headers] for key in order]
    return ExtractResult(headers=all_headers, rows=rows)


def rows_as_dicts(headers: list[str], rows: list[list[str]]) -> list[dict[str, str]]:
    return _rows_as_dicts(headers, rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extrai tabelas de PDFs e salva em JSON. Clientes são unidos por Cod.Cadastro quando a tabela está quebrada em várias páginas."
    )
    parser.add_argument("--products-pdf", type=Path)
    parser.add_argument("--clients-pdf", type=Path)
    parser.add_argument("--out-dir", type=Path, default=Path("data"))
    args = parser.parse_args()

    if args.products_pdf is None and args.clients_pdf is None:
        parser.error("informe --products-pdf, --clients-pdf ou ambos")

    args.out_dir.mkdir(parents=True, exist_ok=True)

    if args.products_pdf is not None:
        products = extract_first_table_from_all_pages(args.products_pdf)
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
        (args.out_dir / "products.json").write_text(
            json.dumps(rows_as_dicts(products.headers, products.rows), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"Products: {len(products.rows)} rows, {len(products.headers)} columns")

    if args.clients_pdf is not None:
        clients = extract_customer_tables_by_key(args.clients_pdf)
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
        (args.out_dir / "clients.json").write_text(
            json.dumps(rows_as_dicts(clients.headers, clients.rows), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"Clients: {len(clients.rows)} rows, {len(clients.headers)} columns")


if __name__ == "__main__":
    main()
