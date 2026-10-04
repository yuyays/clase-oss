import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/lib/query-client';
import { AppRouter } from '@/router';
import { LocaleProvider } from '@/ui/locale';

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LocaleProvider>
      <AppRouter />
    </LocaleProvider>
  </QueryClientProvider>
);

export default App;
