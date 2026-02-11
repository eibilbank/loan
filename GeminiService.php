<?php
class GeminiService {
    private static function callApi($model, $payload) {
        $apiKey = getenv('API_KEY');
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}";

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        
        $response = curl_exec($ch);
        curl_close($ch);
        
        return json_decode($response, true);
    }

    public static function analyzeStatement($text) {
        $payload = [
            'contents' => [['parts' => [['text' => "Analyze this bank statement and return JSON: $text"]]]],
            'generationConfig' => [
                'responseMimeType' => 'application/json'
            ]
        ];
        
        $result = self::callApi('gemini-3-flash-preview', $payload);
        $jsonStr = $result['candidates'][0]['content']['parts'][0]['text'] ?? '{}';
        return json_decode($jsonStr, true);
    }
}
?>