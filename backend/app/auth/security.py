"""Mobile normalization helper for Supabase Auth slice."""

import re


def normalize_mobile(raw: str) -> str:
    """Normalize to E.164-like form.

    - Strips spaces, dashes, parentheses.
    - If input starts with '+', preserves '+' and digits.
    - If 10 digits, assumes Indian (+91) prefix.
    - Otherwise prefixes '+'.
    """
    raw = raw.strip()
    if not raw:
        return raw
    has_plus = raw.startswith("+")
    digits = re.sub(r"\D", "", raw)
    if has_plus:
        return f"+{digits}"
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    return f"+{digits}"
