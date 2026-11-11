// Shared by the server layout (runs before first paint) and the client theme switch. Not a client module, so the
// layout gets the real string.
export const THEME_KEY = "standing-theme";
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
