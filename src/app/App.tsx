import { Providers } from './providers';
import { Layout } from './layout';
import { AppRoutes } from './routes';

export function App() {
  return (
    <Providers>
      <Layout>
        <AppRoutes />
      </Layout>
    </Providers>
  );
}
