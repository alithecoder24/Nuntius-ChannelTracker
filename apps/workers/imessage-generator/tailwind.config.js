/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./templates/**/*.html",
        "./static/src/**/*.js",
        "./node_modules/flowbite/**/*.js"
    ],
    theme: {
        extend: {
            colors: {
                'custom-gray': '#656565',
                'custom-light-gray': '#898989',
                'custom-blue': '#0A68FE',
                'custom-green': '#0FB684',
                'custom-black': "#232323",
                'background': '#D9D9D9',
            }
        }
    },
    plugins: [
        require("flowbite/plugin"),
        require('@tailwindcss/forms'),
    ],
}
