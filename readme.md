<h1 align="center">
  <br>
  <a href="https://github.com/HR/spacedrop"><img src="./build/icon.png" alt="Spacedrop" width="180" style= "margin-bottom: 1rem"></a>
  <br>
  Spacedrop
  <br>
  <br>
</h1>

<h4 align="center">A decentralized end-to-end encrypted file sharing app.</h4>
<p align="center">
    <a href="https://github.com/HR/spacedrop/releases/latest">
        <img src="https://img.shields.io/badge/Download-black.svg?style=flat&color=2c2c2c"
            alt="Download latest release" style= "margin-bottom: 0.5rem" height="25px">
    </a>
</p>

> Spacedrop > Airdrop

A peer-to-peer end-to-end encrypted file sharing desktop app. Like _Airdrop_
but works over the internet rather than bluetooth/Wi-Fi, hence, _Spacedrop_.


Implements the secure [signal
protocol](https://signal.org/docs/specifications/doubleratchet/) to enable the
end-to-end encryption of file transfers with authentication.

<br>
<p align="center">
  <a href="https://github.com/HR/spacedrop/releases/latest">
    <img src=".github/screen.png">
  </a>
</p>
<p align="center">
  <a href="https://github.com/HR/spacedrop/releases/latest">
    <img src=".github/screen_dark.png">
  </a>
</p>

## Features
- [x] Peer-to-peer file sharing
- [x] End-to-end encryption
- [x] Persistent Wormholes (tunnels/contacts) for recurring shares
- [x] Pause/resume/cancel shares
- [x] Dark Mode
- [ ] Persist unfinished shares
- [ ] Share files from file manager(s)
- [ ] Wi-Fi/LAN file shares
- [ ] Web-service

You are welcome to open pull requests to help implement the features still to
do!

## Install

_macOS 10.10+, Linux, and Windows 7+ are supported (64-bit only)._

**macOS**

[**Download**](https://github.com/hr/spacedrop/releases/latest) the `.dmg` file.

**Linux**

[**Download**](https://github.com/hr/spacedrop/releases/latest) the `.AppImage` or `.deb` file.

_The AppImage needs to be [made executable](http://discourse.appimage.org/t/how-to-make-an-appimage-executable/80) after download._

**Windows**

[**Download**](https://github.com/hr/spacedrop/releases/latest) the `.exe` file.


## Dev

Needs the Spacedrop Server as well (https://github.com/HR/spacedrop-server/)

### Setup

Clone the repos

```
$ git clone --recurse-submodules https://github.com/HR/spacedrop.git
$ git clone https://github.com/HR/spacedrop-server.git
```

Install deps for both repos

```
$ yarn
```

### Run

For faster dev, run the bundler (webpack)

```
$ yarn run bundler
```

In a new tty, run the app

```
$ gulp
```

To test the app locally with another app, just run a second instance in a new
tty

```
$ gulp
```

N.B. on macOS, you may be prompted to allow incoming connections everytime you
run it. Unfortunately the only way to make that go away currently is to disable
your firewall temporarily.

### Publish

```
$ npm run release
```

After Travis finishes building your app, open the release draft it created and
click "Publish".


<> with <3 by Habib Rehman
