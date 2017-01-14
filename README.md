# vs-kubernetes README

`vs-kubernetes` provides a Visual Studio Code extension for interacting with Kubernetes clusters.

## Features

`vs-kubernetes` supports a number of commands for interacting with Kubernetes, they are accessible via the command
menu (`ctrl-shift-p`)

### General commands

   * `Kubernetes Load` - Load a resource from the Kubernetes API and create a new editor window.
   * `Kubernetes Get` - Get the status for a specific resource.
   * `Kubernetes Logs` - Get logs for a pod in an output window.

### Commands while viewing a Kubernetes file

   * `Kubernetes Explain` - Use the `kubectl explain ...` tool to annotate Kubernetes API objects
   * `Kubernetes Create` - Create an object using the current document
   * `Kubernetes Delete` - Delete an object contained in the current document.
   * `Kubernetes Apply` - Apply changes to an object contained in the current document.
   * `Kubernetes Expose` - Expose the object in the current document as a service.

### Commands for application directories
   * `Kubernetes Run` - Run the current application as a Kubernetes Deployment

## Extension Settings

None currently.

## Known Issues

Nothing known (plenty unknown ;)

## Release Notes

### 0.0.1

Initial release of vs-kubernetes

### 0.0.2

Internal revision

### 0.0.3

* Add `kubernetes sync` which synchronizes your git repo with running containers

