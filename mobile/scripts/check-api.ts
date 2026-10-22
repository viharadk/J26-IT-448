import { createApiClient } from '../src/api/client';

createApiClient(process.env.EXPO_PUBLIC_API_URL).testConnection()
  .then(result => console.log('PASS GET /api/flood/test:', JSON.stringify(result)))
  .catch(error => { console.error('FAIL:', error.message); process.exitCode = 1; });
