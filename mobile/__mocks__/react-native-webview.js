// Nei test (jest) la WebView nativa non esiste: al suo posto una View con le stesse props.
const React = require('react');
const { View } = require('react-native');

const WebView = React.forwardRef(function WebView(props, ref) {
  React.useImperativeHandle(ref, () => ({ injectJavaScript: () => {}, reload: () => {} }));
  return React.createElement(View, { testID: 'webview', accessibilityLabel: props.accessibilityLabel, style: props.style });
});

module.exports = { WebView, default: WebView };
