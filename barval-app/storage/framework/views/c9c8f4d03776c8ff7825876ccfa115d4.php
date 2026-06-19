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
        <div class="title"><?php echo e($report['title']); ?></div>
        <div class="period"><?php echo e($report['period']); ?> &middot; Generated <?php echo e($generatedAt); ?></div>
    </div>

    <table>
        <thead>
            <tr>
                <?php $__currentLoopData = $report['columns']; $__env->addLoop($__currentLoopData); foreach($__currentLoopData as $col): $__env->incrementLoopIndices(); $loop = $__env->getLastLoop(); ?>
                    <th class="<?php echo e(($col['align'] ?? 'left') === 'right' ? 'r' : ''); ?>"><?php echo e($col['label']); ?></th>
                <?php endforeach; $__env->popLoop(); $loop = $__env->getLastLoop(); ?>
            </tr>
        </thead>
        <tbody>
            <?php $__empty_1 = true; $__currentLoopData = $report['rows']; $__env->addLoop($__currentLoopData); foreach($__currentLoopData as $row): $__env->incrementLoopIndices(); $loop = $__env->getLastLoop(); $__empty_1 = false; ?>
                <tr>
                    <?php $__currentLoopData = $report['columns']; $__env->addLoop($__currentLoopData); foreach($__currentLoopData as $col): $__env->incrementLoopIndices(); $loop = $__env->getLastLoop(); ?>
                        <?php $v = $row[$col['key']] ?? ''; ?>
                        <td class="<?php echo e(($col['align'] ?? 'left') === 'right' ? 'r' : ''); ?>">
                            <?php echo e(!empty($col['money']) && is_numeric($v) ? \App\Support\Money::format((int) $v) : $v); ?>

                        </td>
                    <?php endforeach; $__env->popLoop(); $loop = $__env->getLastLoop(); ?>
                </tr>
            <?php endforeach; $__env->popLoop(); $loop = $__env->getLastLoop(); if ($__empty_1): ?>
                <tr><td colspan="<?php echo e(count($report['columns'])); ?>" style="text-align:center;color:#999">No data</td></tr>
            <?php endif; ?>
        </tbody>
    </table>

    <?php if(!empty($report['summary'])): ?>
        <table class="summary">
            <?php $__currentLoopData = $report['summary']; $__env->addLoop($__currentLoopData); foreach($__currentLoopData as $s): $__env->incrementLoopIndices(); $loop = $__env->getLastLoop(); ?>
                <tr>
                    <td class="lbl"><?php echo e($s['label']); ?></td>
                    <td class="val"><?php echo e(!empty($s['money']) ? \App\Support\Money::format((int) $s['value']) : $s['value']); ?></td>
                </tr>
            <?php endforeach; $__env->popLoop(); $loop = $__env->getLastLoop(); ?>
        </table>
    <?php endif; ?>

    <div class="footer">Biryaal Block Factory ERP &middot; Software by Talha Khan (WhatsApp 92-336-8469404)</div>
</body>
</html>
<?php /**PATH /Users/eapple/Documents/m ali block factory/backend/resources/views/reports/generic.blade.php ENDPATH**/ ?>