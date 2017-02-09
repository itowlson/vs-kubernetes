# vs-kubernetes README

`vs-kubernetes` provides a Visual Studio Code extension for interacting with Kubernetes clusters.

## Configuring

### Setting up your environment.

This extension assumes that you have a `Dockerfile` in the root directory of
your project.

It also assumes that you have the following binaries on your `PATH`:
   * `kubectl`
   * `docker`
   * `git`

If you don't have those on your PATH then the extension will fail in
unexpected ways.

### Setting up the image repository path
If you want to use the `Kubernetes Run` and `Kubernetes Debug` features
then you need to have correctly set the image and repository for your
images. You can do this via preferences in VS-Code:

File > Preferences

And then add:

```javascript
{
  ...
  "vsdocker.imageUser": "<your-image-prefix-here>",
  ...
}
```

Where `<your-image-prefix-here>` is something like `docker.io/brendanburns`.


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
* Initial release of the extension in the marketplace

### 0.0.4

Add checking for the `kubectl` binary in the `PATH`

### 0.0.5

Add support for 'diff' between files and objects on server
Add support for exec and terminal into pods

### 0.0.6

Add support for interactive node.js debugging (Alpha)
Auto build/push for run and debug

### 0.0.7

Fix a hard-coded value that made debug not work on any machine except mine...
