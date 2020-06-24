import React, { useState, useEffect } from 'react'
import { Modal, Form, Button } from 'react-bootstrap'

export default function WormholeModal (props) {
  const { state, type, disabledId, onSubmit, ...rprops } = props
  const initName = state ? state.name : ''
  const initID = state ? state.id : ''
  console.log(initName, initID)
  const [name, setName] = useState(initName)
  const [id, setID] = useState(initID)
  // Clear on dismissal
  useEffect(() => {
    setName(initName)
    setID(initID)
  }, [props.show])

  return (
    <Modal
      {...rprops}
      size='lg'
      aria-labelledby='contained-modal-title-vcenter'
      centered
    >
      <Modal.Header closeButton>
        <Modal.Title id='contained-modal-title-vcenter'>
          {type} a wormhole
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group controlId='wormholeName'>
          <Form.Label>Name</Form.Label>
          <Form.Control
            type='text'
            placeholder='Enter name'
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </Form.Group>
        <Form.Group controlId='wormholeID'>
          <Form.Label>Spacedrop ID</Form.Label>
          <Form.Control
            disabled={disabledId}
            type='text'
            placeholder='Enter Spacedrop ID (public key)'
            value={id}
            onChange={event => setID(event.target.value)}
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={() => onSubmit({ name, id })}>{type}</Button>
      </Modal.Footer>
    </Modal>
  )
}
