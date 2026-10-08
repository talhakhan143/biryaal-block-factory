<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Search\GlobalSearchService;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    public function __construct(private GlobalSearchService $search) {}

    /** Poore system me aik hi dabbe se dhoondna. */
    public function index(Request $request)
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
        ]);

        $groups = $this->search->search($data['q'] ?? '');

        return response()->json([
            'query' => $data['q'] ?? '',
            'groups' => $groups,
            'total' => collect($groups)->sum(fn (array $g) => count($g['items'])),
        ]);
    }
}
