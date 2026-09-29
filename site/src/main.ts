// The homepage. The simulations themselves live at their own routes: nothing of them is loaded here.
import './base';
import { initPreviews } from './preview';

if (document.readyState === 'complete') initPreviews();
else window.addEventListener('load', initPreviews, { once: true });
