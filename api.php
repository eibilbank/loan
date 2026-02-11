<?php
require_once 'CreditEngine.php';
require_once 'GeminiService.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true);

switch ($action) {
    case 'analyze':
        $analysis = GeminiService::analyzeStatement($input['text'] ?? '');
        echo json_encode(['success' => true, 'data' => $analysis]);
        break;

    case 'submit':
        $app = $input['application'];
        $score = CreditEngine::calculateScore($app);
        $offer = CreditEngine::generateOffer($app, $score);
        
        // Simulating DB save here
        $app['creditScore'] = $score;
        $app['loanOffer'] = $offer;
        $app['status'] = 'SUBMITTED';
        
        echo json_encode(['success' => true, 'application' => $app]);
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
        break;
}
?>