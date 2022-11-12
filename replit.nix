{ pkgs }: {
  deps = [
    pkgs.busybox-sandbox-shell
    pkgs.nodePackages.vscode-langservers-extracted
    pkgs.nodePackages.typescript-language-server
  ];
}