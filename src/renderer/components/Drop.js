import React from 'react'
import { basename } from 'path'
import { classList } from '../lib/util'
import { DROP_TYPE, DROP_STATUS } from '../../consts'
import filesize from 'filesize'
import { Row, Col, ProgressBar } from 'react-bootstrap'

const remote = require('electron').remote
const { shell } = remote

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
  const {
    onResumeClick,
    onPauseClick,
    onDeleteClick,
    id,
    name,
    type,
    path,
    percentage,
    transferred,
    length,
    speed,
    eta,
    status
  } = props

  let statusStr,
    action,
    isDone = false
  const isDownload = type === DROP_TYPE.DOWNLOAD
  const percent = Math.round(percentage || 0)
  const etaStr = sec2time(eta || 0)
  const tranStr = filesize(transferred || 0)
  const lenStr = filesize(length || 0)
  const speedStr = filesize(speed || 0)
  const typeStr = isDownload ? 'Received' : 'Sent'

  switch (status) {
    case DROP_STATUS.DONE:
      statusStr = `${typeStr} successfully`
      isDone = true
      break
    case DROP_STATUS.PAUSED:
      statusStr = `${typeStr} paused`
      action = !isDownload && (
        <i className='ion-ios-play' onClick={onResumeClick} />
      )
      break
    case DROP_STATUS.PENDING:
      statusStr =
        `${type} ${speedStr}/s ` +
        `- ${typeStr} ${tranStr} of ${lenStr} (${percent}%), ${etaStr} left`
      action = !isDownload && (
        <i className='ion-ios-pause' onClick={onPauseClick} />
      )
      break
    default:
      throw new Error('Unknown drop status')
  }

  return (
    <Row className='drop'>
      <Col className='info'>
        <Row className='name-row'>
          <Col className='name' onClick={() => shell.openPath(path)}>
            {name}
          </Col>
          <Col className='text-right actions'>
            <i
              className='ion-ios-search'
              onClick={() => shell.showItemInFolder(path)}
            />
            {action}
            <i className='ion-ios-close-circle' onClick={onDeleteClick} />
          </Col>
        </Row>
        <Row className='status'>
          <Col>{statusStr}</Col>
        </Row>
        <Row className='progressbar'>
          <Col>
            <ProgressBar
              animated={!isDone}
              variant={!isDownload && 'success'}
              now={percent}
            />
          </Col>
        </Row>
      </Col>
    </Row>
  )
}
