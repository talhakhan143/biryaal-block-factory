<?php

namespace App\Http\Controllers\Concerns;

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
     * @param  string[]  $sortable          columns allowed for ?sort=
     * @param  string[]  $searchable         own columns matched against ?search=
     * @param  array<string,string[]>  $searchRelations  [relation => [columns]] also matched
     */
    protected function applyTableQuery(
        Builder $query,
        Request $request,
        array $sortable,
        array $searchable,
        string $defaultSort,
        array $searchRelations = [],
    ): Builder {
        $sort = in_array($request->sort, $sortable, true) ? $request->sort : $defaultSort;
        $dir = $request->dir === 'asc' ? 'asc' : 'desc';

        $query->when($request->search, function (Builder $q, $s) use ($searchable, $searchRelations) {
            $q->where(function (Builder $q) use ($s, $searchable, $searchRelations) {
                foreach ($searchable as $col) {
                    $q->orWhere($col, 'like', "%{$s}%");
                }
                foreach ($searchRelations as $rel => $cols) {
                    foreach ($cols as $col) {
                        $q->orWhereHas($rel, fn (Builder $q) => $q->where($col, 'like', "%{$s}%"));
                    }
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
