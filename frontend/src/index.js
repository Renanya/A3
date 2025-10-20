import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';
import { TokenProvider } from './TokenContext';


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <TokenProvider>
      <App />
    </TokenProvider>

);
