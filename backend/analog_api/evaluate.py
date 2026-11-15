"""Run a grouped, external-reference benchmark for the fixed baselines."""
import argparse
from dataclasses import replace
import json
from pathlib import Path

from pydantic import TypeAdapter

from .catalog import DATA, Catalog, load_catalog
from .models import Category, Model, Objective, RecommendRequest, Text
from .ranking import rank
from .retrieval import LocalSentenceEncoder, search_cases, term_statistics

DEFAULT_QUERIES = DATA.parent / "evaluation" / "independent_queries.json"


class Judgement(Model):
    id: Text
    query: Text
    category: Category
    objective: Objective
    site_group: Text
    reference: Text


def evaluate(catalog: Catalog, judgements: list[Judgement], encoder=None):
    catalog_urls = {source.url.rstrip("/") for source in catalog.sources.values()}
    known_groups = {site.site_group for site in catalog.sites.values()}
    if len({row.site_group for row in judgements}) != len(judgements):
        raise ValueError("Use one judgement per held-out site group in this benchmark.")
    if any(row.reference.rstrip("/") in catalog_urls or not row.reference.startswith("https://")
           or row.category != row.objective.category or row.site_group not in known_groups for row in judgements):
        raise ValueError("Judgements must use external references, known groups and matching categories.")

    def position(groups, expected):
        return groups.index(expected) + 1 if expected in groups else None

    def unique_groups(results):
        return list(dict.fromkeys(row.site.site_group for row in results))

    rows = []
    for row in judgements:
        group = row.site_group
        held_ids = {site.id for site in catalog.sites.values() if site.site_group == group}
        train_cases = tuple(case for case in catalog.cases if case.site_id not in held_ids)
        scoring_catalog = replace(
            catalog, cases=train_cases,
            sites={site.id: site.model_copy(update={"observations": []}) if site.id in held_ids else site
                   for site in catalog.sites.values()},
            features=catalog.features.model_copy(update={
                "earth": {site_id: [m for m in values if site_id not in held_ids
                                    or catalog.sources[m.source_id].kind == "product"]
                          for site_id, values in catalog.features.earth.items()}
            }),
        )
        stats = term_statistics(catalog, train_cases)
        matches = search_cases(catalog, row.query, row.category, limit=len(catalog.cases),
                               statistics=stats, encoder=encoder)
        groups = [catalog.sites[m.case.site_id].site_group for m in matches]
        request = RecommendRequest(mission={"objectives": [row.objective]}, limit=20)
        masked = rank(scoring_catalog, request).results[0]
        deployed = rank(catalog, request).results[0]
        physical_index = replace(catalog, cases=(), sites={
            site.id: site.model_copy(update={"observations": []}) for site in catalog.sites.values()
        })
        physical = rank(physical_index, request.model_copy(update={"ranking_mode": "environmental"})).results[0]
        hidden_index = replace(catalog, cases=train_cases)
        hidden_matches = search_cases(hidden_index, row.query, row.category, limit=len(catalog.cases),
                                      statistics=stats, encoder=encoder)
        hidden_groups = [catalog.sites[m.case.site_id].site_group for m in hidden_matches]
        rows.append({
            "judgement": row.id, "held_out_group": group, "lexical_reference_fit_groups": stats[1],
            "retrieval_rank": position(groups, group),
            "case_blind_screening_rank": position(unique_groups(masked.recommendations), group),
            "full_catalog_screening_rank": position(unique_groups(deployed.recommendations), group),
            "environmental_rank": position(unique_groups(physical.recommendations), group),
            "retrieval_hidden_index_rank": position(hidden_groups, group),
            "environmental_target_pending": any(r.site.site_group == group for r in physical.needs_data)
                                            and not any(r.site.site_group == group for r in physical.recommendations),
            "environmental_top_three_boundary_tie": (
                len(physical.recommendations) > 3 and
                physical.recommendations[2].suitability_index == physical.recommendations[3].suitability_index
            ),
        })

    def metrics(column):
        ranks = [row[column] for row in rows]
        return {
            "documented_hit_at_3": sum(rank is not None and rank <= 3 for rank in ranks),
            "documented_hit_at_5": sum(rank is not None and rank <= 5 for rank in ranks),
            "total": len(ranks),
            "mean_reciprocal_documented_rank": round(sum(1 / rank for rank in ranks if rank) / len(ranks), 3),
        } if ranks else {}

    return {"retrieval": metrics("retrieval_rank"), "case_blind_screening": metrics("case_blind_screening_rank"),
            "full_catalog_screening": metrics("full_catalog_screening_rank"),
            "environmental": metrics("environmental_rank"),
            "retrieval_hidden_index": metrics("retrieval_hidden_index_rank"), "folds": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--judgements", type=Path, default=DEFAULT_QUERIES)
    parser.add_argument("--embedding-model", type=Path)
    args = parser.parse_args()
    judgements = TypeAdapter(list[Judgement]).validate_json(args.judgements.read_bytes())
    encoder = LocalSentenceEncoder(args.embedding_model) if args.embedding_model else None
    print(json.dumps(evaluate(load_catalog(), judgements, encoder), indent=2))


if __name__ == "__main__":
    main()
