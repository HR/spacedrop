import React from 'react'
import { basename } from 'path'
import { classList } from '../lib/util'
import { DROP_TYPE } from '../../consts'
import filesize from 'filesize'
import { Row, Col, ProgressBar } from 'react-bootstrap'

// Select greatest time unit for eta
function sec2time (sec) {
  const time = parseFloat(sec).toFixed(3),
    hrs = Math.floor(time / 60 / 60),
    mins = Math.floor(time / 60) % 60,
    secs = Math.floor(time - mins * 60)

  return (
    (hrs && hrs + ' hours') ||
    (mins && mins + ' minutes') ||
    (secs && secs + ' seconds')
  )
}

export default function Drop (props) {
  const { name, type, path, progress, total, rate, done } = props

  const isDownload = type === DROP_TYPE.DOWNLOAD
  const percent = done ? 100 : Math.round((progress / total) * 100)
  const eta = sec2time(total / rate)
  const progStr = filesize(progress)
  const totalStr = filesize(total)
  const rateStr = filesize(rate)
  const typeStr = isDownload ? 'Received' : 'Sent'
  const status = done
    ? `${typeStr} successfully`
    : `${type} ${rateStr}/s - ${typeStr} ${progStr} of ${totalStr} (${percent}%), ${eta} left`

  return (
    <Row className='drop'>
      <Col className='info'>
        <Row className='name'>
          <Col>{name}</Col>
          {/* <Col className='text-right actions'>
            <i className='ion-ios-pause' />
            <i className='ion-ios-close-circle' />
          </Col> */}
        </Row>
        <Row className='status'>
          <Col>{status}</Col>
        </Row>
        <Row className='progressbar'>
          <Col>
            <ProgressBar animated={!done} variant={!isDownload && 'success'} now={percent} />
          </Col>
        </Row>
      </Col>
    </Row>
  )
}
