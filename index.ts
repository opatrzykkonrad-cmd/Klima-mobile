import { registerRootComponent } from 'expo';
// Definicja zadania w tle musi zostać załadowana przy starcie procesu (także bez UI).
import './src/services/background';
import App from './App';

registerRootComponent(App);
