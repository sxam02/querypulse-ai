import { PostgresCompareService } from './lib/services/postgresCompareService';

try {
  const sourceSnapshot = PostgresCompareService.getDemoSnapshot('source');
  const destSnapshot = PostgresCompareService.getDemoSnapshot('destination');

  // Let's test with components = ['views']
  const result = PostgresCompareService.compareSchemas(sourceSnapshot, destSnapshot, ['views']);
  console.log('Comparison with views succeeded:', result.summary);
} catch (err: any) {
  console.error('Error during comparison:', err.stack || err);
}
