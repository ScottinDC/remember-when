import {defineConfig,devices} from '@playwright/test';
const localURL='http://127.0.0.1:5174';
export default defineConfig({
 testDir:'e2e',fullyParallel:false,forbidOnly:Boolean(process.env.CI),retries:0,workers:1,
 reporter:[['list'],['html',{open:'never',outputFolder:'e2e-report'}]],
 timeout:45000,expect:{timeout:12000},outputDir:'e2e-results',
 use:{trace:'retain-on-failure',screenshot:'only-on-failure',video:'off',serviceWorkers:'block'},
 webServer:{command:'npx vite --host 127.0.0.1 --port 5174',url:localURL,reuseExistingServer:false,env:{VITE_SUPABASE_URL:'http://127.0.0.1:54399',VITE_SUPABASE_PUBLISHABLE_KEY:'synthetic-public-test-key',VITE_AUTH_PROVIDER:'supabase'}},
 projects:[
  {name:'local',testMatch:'archive.spec.ts',use:{...devices['Desktop Chrome'],baseURL:localURL}},
  {name:'mobile',testMatch:'archive.spec.ts',use:{...devices['Pixel 7'],baseURL:localURL}},
  {name:'webkit',testMatch:'archive.spec.ts',use:{...devices['iPhone 13'],baseURL:localURL}},
  {name:'production',testMatch:'production-flow.spec.ts',use:{...devices['Desktop Chrome'],baseURL:process.env.E2E_PRODUCTION_URL??'https://chic-sherbet-39bee5.netlify.app'}}
 ]
});
