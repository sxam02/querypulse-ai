import { PostgresCompareService } from './lib/services/postgresCompareService';

const sourceSnapshot = {
  views: {
    active_users_view: null
  }
};
const destinationSnapshot = {
  views: {
    active_users_view: null
  }
};
const components = ['views'];

try {
  const result = PostgresCompareService.compareSchemas(sourceSnapshot as any, destinationSnapshot as any, components);
  console.log('Success summary:', result.summary);
} catch (err: any) {
  console.error('Failed:', err.stack || err);
}
