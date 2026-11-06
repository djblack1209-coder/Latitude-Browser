// Package uistyle shares the Terminal palette between the WebView and local diagnostics.
package uistyle

import _ "embed"

//go:embed tokens.css
var Tokens string
