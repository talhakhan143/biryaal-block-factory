<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { font-family: DejaVu Sans, sans-serif; }
        body { font-size: 12px; color: #111; margin: 24px; }
        .head { text-align: center; margin-bottom: 4px; }
        .brand { font-size: 18px; font-weight: bold; }
        .title { font-size: 14px; margin-top: 8px; }
        .period { color: #666; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th { background: #1e3a8a; color: #fff; text-align: left; padding: 6px 8px; font-size: 11px; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        .r { text-align: right; }
        .summary { margin-top: 16px; width: 50%; float: right; }
        .summary td { border-bottom: 1px solid #ddd; }
        .summary .lbl { color: #555; }
        .summary .val { text-align: right; font-weight: bold; }
        .footer { margin-top: 60px; text-align: center; color: #999; font-size: 10px; }
    </style>
</head>
<body>
    <div class="head">
        <div class="brand">Biryaal Block Factory</div>
        <div class="period">Cement Hollow Blocks</div>
        <div class="title">{{ $report['title'] }}</div>
        <div class="period">{{ $report['period'] }} &middot; Generated {{ $generatedAt }}</div>
    </div>

    <table>
        <thead>
            <tr>
                @foreach ($report['columns'] as $col)
                    <th class="{{ ($col['align'] ?? 'left') === 'right' ? 'r' : '' }}">{{ $col['label'] }}</th>
                @endforeach
            </tr>
        </thead>
        <tbody>
            @forelse ($report['rows'] as $row)
                <tr>
                    @foreach ($report['columns'] as $col)
                        @php $v = $row[$col['key']] ?? ''; @endphp
                        <td class="{{ ($col['align'] ?? 'left') === 'right' ? 'r' : '' }}">
                            {{ !empty($col['money']) && is_numeric($v) ? \App\Support\Money::format((int) $v) : $v }}
                        </td>
                    @endforeach
                </tr>
            @empty
                <tr><td colspan="{{ count($report['columns']) }}" style="text-align:center;color:#999">No data</td></tr>
            @endforelse
        </tbody>
    </table>

    @if (!empty($report['summary']))
        <table class="summary">
            @foreach ($report['summary'] as $s)
                <tr>
                    <td class="lbl">{{ $s['label'] }}</td>
                    <td class="val">{{ !empty($s['money']) ? \App\Support\Money::format((int) $s['value']) : $s['value'] }}</td>
                </tr>
            @endforeach
        </table>
    @endif

    <div class="footer">Biryaal Block Factory ERP &middot; Software by Talha Khan (WhatsApp 92-336-8469404)</div>
</body>
</html>
