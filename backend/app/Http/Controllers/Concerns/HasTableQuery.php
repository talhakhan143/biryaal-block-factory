<?php

namespace App\Http\Controllers\Concerns;

use App\Support\Search;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * Shared list-query behaviour for DataTable-backed index endpoints:
 * ?search= (own columns + relation columns), ?sort= / ?dir= (whitelisted),
 * and a newest-first default ordering.
 */
trait HasTableQuery
{
    /**
     * @param  string[]  $sortable  columns allowed for ?sort=
     * @param  string[]  $searchable  own columns matched against ?search=
     * @param  array<string,string[]>  $searchRelations  [relation => [columns]] also matched
     * @param  array<string,class-string[]>  $searchMorphs  [morphTo relation => [possible models]], matched on `name`
     */
    protected function applyTableQuery(
        Builder $query,
        Request $request,
        array $sortable,
        array $searchable,
        string $defaultSort,
        array $searchRelations = [],
        array $searchMorphs = [],
    ): Builder {
        $sort = in_array($request->sort, $sortable, true) ? $request->sort : $defaultSort;
        $dir = $request->dir === 'asc' ? 'asc' : 'desc';

        $query->when($request->search, function (Builder $q, $s) use ($searchable, $searchRelations, $searchMorphs) {
            // LIKE ke wildcards ko aam harf bana dete hain, warna "%" likhne
            // par poori list aa jati hai.
            $like = Search::like((string) $s);
            $q->where(function (Builder $q) use ($like, $searchable, $searchRelations, $searchMorphs) {
                foreach ($searchable as $col) {
                    $q->orWhere($col, 'like', $like);
                }
                foreach ($searchRelations as $rel => $cols) {
                    foreach ($cols as $col) {
                        $q->orWhereHas($rel, fn (Builder $q) => $q->where($col, 'like', $like));
                    }
                }
                // morphTo par whereHas nahi chalta, is liye whereHasMorph
                foreach ($searchMorphs as $rel => $types) {
                    $q->orWhereHasMorph($rel, $types, fn (Builder $q) => $q->where('name', 'like', $like));
                }
            });
        });

        $query->orderBy($sort, $dir);

        if ($sort !== 'created_at') {
            $query->orderBy('created_at', 'desc');
        }

        return $query;
    }
}
