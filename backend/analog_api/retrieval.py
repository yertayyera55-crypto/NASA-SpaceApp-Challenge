"""Grouped literature retrieval with lexical and optional frozen semantic scoring."""
from collections import Counter, defaultdict
from collections.abc import Iterable
from math import log, sqrt
from pathlib import Path
import re

from .catalog import Catalog
from .models import Case, CaseMatch, Category

STOP_WORDS = {"a", "an", "and", "at", "for", "from", "in", "of", "on", "the", "to", "using", "with"}


def terms(text: str) -> Counter[str]:
    return Counter(word for word in re.findall(r"[^\W\d_]{2,}", text.casefold()) if word not in STOP_WORDS)


def case_text(case: Case) -> str:
    return " ".join((case.title, case.research_objective, case.selection_rationale,
                     " ".join(case.environment), case.experiment))


def term_statistics(catalog: Catalog, cases: Iterable[Case]) -> tuple[Counter, int]:
    groups = defaultdict(set)
    for case in cases:
        groups[catalog.sites[case.site_id].site_group].update(terms(case_text(case)))
    return Counter(term for group in groups.values() for term in group), len(groups)


def search_cases(catalog: Catalog, query: str, category: Category | None = None, limit: int = 5,
                 *, statistics: tuple[Counter, int] | None = None, encoder=None) -> list[CaseMatch]:
    cases = [case for case in catalog.cases if category is None or category in case.categories]
    if not cases:
        return []
    if encoder is not None:
        scores = encoder.similarities(query, cases)
    else:
        frequencies, group_count = statistics if statistics is not None else term_statistics(catalog, catalog.cases)

        def vector(counts):
            return {term: (1 + log(count)) * (1 + log((group_count + 1) / (frequencies[term] + 1)))
                    for term, count in counts.items()}

        def norm(values):
            return sqrt(sum(value ** 2 for value in values.values()))

        q = vector(terms(query))
        q_norm = norm(q)
        if not q_norm:
            return []
        scores = []
        for case in cases:
            doc = vector(terms(case_text(case)))
            dot = sum(weight * doc.get(term, 0) for term, weight in q.items())
            scores.append(dot / (q_norm * norm(doc)) if dot else 0)

    best: dict[str, CaseMatch] = {}
    for case, score in zip(cases, scores, strict=True):
        if score <= 0:
            continue
        relevance = round(min(1.0, float(score)), 6)
        group = catalog.sites[case.site_id].site_group
        existing = best.get(group)
        if existing is None or (-relevance, case.id) < (-existing.relevance, existing.case.id):
            best[group] = CaseMatch(case=case, source=catalog.sources[case.source_id], relevance=relevance)
    return sorted(best.values(), key=lambda match: (-match.relevance, match.case.id))[:limit]


class LocalSentenceEncoder:
    """Use a locally installed frozen model with no automatic downloads."""

    def __init__(self, path: Path):
        from sentence_transformers import SentenceTransformer

        if not path.is_dir():
            raise ValueError("ANALOG_EMBEDDING_MODEL must point to a local model directory.")
        self.model = SentenceTransformer(str(path.resolve()), local_files_only=True, trust_remote_code=False)

    def similarities(self, query: str, cases: list[Case]):
        vectors = self.model.encode([query, *(case_text(case) for case in cases)], normalize_embeddings=True)
        return vectors[1:] @ vectors[0]
