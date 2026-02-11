<?php
class CreditEngine {
    private const BASE_SCORE = 450;
    private const MIN_SCORE = 300;
    private const MAX_SCORE = 900;

    public static function calculateScore($app) {
        $score = self::BASE_SCORE;
        $flags = [];
        
        // 1. Bank Behavior
        $bankPoints = 0;
        $analysis = $app['statementAnalysis'] ?? null;
        if ($analysis) {
            if ($analysis['avgMonthlyBalance'] > 50000) $bankPoints += 80;
            if ($analysis['salaryCredits'] > 0) $bankPoints += 70;
            if ($analysis['bounces'] === 0) $bankPoints += 60;
            if ($analysis['negativeBalanceDays'] > 2) {
                $bankPoints -= 100;
                $flags[] = ['code' => 'NEGATIVE_BALANCE', 'severity' => 'HIGH', 'description' => 'Recent negative balance instances'];
            }
            if ($analysis['bounces'] > 0) {
                $flags[] = ['code' => 'BOUNCE_DETECTED', 'severity' => 'HIGH', 'description' => 'Bounce history detected'];
            }
        }

        // 2. Income
        $incomePoints = 0;
        if (($app['employmentType'] ?? '') === 'SALARIED') $incomePoints += 70;
        if (($app['monthlyIncome'] ?? 0) < 15000) {
            $incomePoints -= 60;
            $flags[] = ['code' => 'LOW_INCOME', 'severity' => 'MEDIUM', 'description' => 'Income below threshold'];
        }

        $score += ($bankPoints + $incomePoints + 50); // Plus static points for kyc/stability
        $score = max(self::MIN_SCORE, min(self::MAX_SCORE, $score));

        $category = 'VERY_HIGH';
        if ($score >= 750) $category = 'LOW';
        elseif ($score >= 650) $category = 'MEDIUM';
        elseif ($score >= 550) $category = 'HIGH';

        return [
            'score' => $score,
            'category' => $category,
            'riskFlags' => $flags,
            'factors' => [
                'bankBehavior' => $bankPoints,
                'incomeEmployment' => $incomePoints
            ]
        ];
    }

    public static function generateOffer($app, $scoreData) {
        $roi = 12.0;
        $tenure = 24;
        $multiplier = 5;

        switch ($scoreData['category']) {
            case 'LOW': $roi = 10.5; $tenure = 36; $multiplier = 12; break;
            case 'MEDIUM': $roi = 14.5; $tenure = 24; $multiplier = 8; break;
            case 'HIGH': $roi = 19.5; $tenure = 12; $multiplier = 4; break;
            case 'VERY_HIGH': $roi = 24.0; $tenure = 6; $multiplier = 2; break;
        }

        $principal = min(($app['monthlyIncome'] ?? 0) * $multiplier, 500000);
        $monthlyRoi = $roi / 12 / 100;
        $emi = ($principal * $monthlyRoi * pow(1 + $monthlyRoi, $tenure)) / (pow(1 + $monthlyRoi, $tenure) - 1);

        return [
            'amount' => round($principal, -3),
            'roi' => $roi,
            'tenure' => $tenure,
            'emi' => round($emi)
        ];
    }
}
?>