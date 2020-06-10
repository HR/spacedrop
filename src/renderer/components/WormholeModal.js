import React, { useState } from 'react'
import { Modal, Form, Button } from 'react-bootstrap'

export default function WormholeModal (props) {
  const [name, setName] = useState('')
  const [id, setID] = useState('')

  return (
    <Modal
      {...props}
      size='lg'
      aria-labelledby='contained-modal-title-vcenter'
      centered
    >
      <Modal.Header closeButton>
        <Modal.Title id='contained-modal-title-vcenter'>
          {props.type} wormhole
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
        <Form.Group controlId='wormholeID' readOnly={props.disabledID}>
          <Form.Label>Spacedrop ID</Form.Label>
          <Form.Control
            type='text'
            placeholder='Enter Spacedrop ID (public key)'
            value={id}
            onChange={event => setID(event.target.value)}
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={() => props.onSubmit({ name, id })}>
          {props.type}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
